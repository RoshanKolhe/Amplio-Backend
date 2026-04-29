import {inject} from '@loopback/core';
import {IsolationLevel, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {AmplioDataSource} from '../datasources';
import {
  InvestorClosedInvestmentStatus,
  InvestorEscrowLedgerStatus,
  InvestorEscrowLedgerType,
  InvestorEscrowAccount,
  InvestorProfile,
  InvestorPtcHolding,
  PoolFinancials,
  PtcIssuance,
  PtcParameters,
  Spv,
} from '../models';
import {
  EscrowSetupRepository,
  InvestorClosedInvestmentRepository,
  InvestorEscrowAccountRepository,
  InvestorEscrowLedgerRepository,
  InvestorProfileRepository,
  InvestorPtcHoldingRepository,
  PoolFinancialsRepository,
  PtcIssuanceRepository,
  PtcParametersRepository,
  SpvRepository,
  TransactionRepository,
} from '../repositories';

export type PtcInventorySummary = {
  totalUnits: number;
  soldUnits: number;
  availableUnits: number;
  maxUnitsPerInvestor: number;
  alreadyOwnedUnits: number;
  investorRemainingLimit: number;
  unitPrice: number;
  soldPercentage: number;
  poolEscrowSetupId: string | null;
};

type BuyAllocationPlanItem = {
  issuance: PtcIssuance;
  allocatedUnits: number;
  costForThisBatch: number;
};

export type BuyUnitsOptions = {
  allowPartialAllocation?: boolean;
  idempotencyKey?: string;
};

export type BuyUnitsResult = {
  spvId: string;
  requestedUnits: number;
  allocatedUnits: number;
  partialAllocation: boolean;
  totalInvestment: number;
  totalUnits: number;
  soldUnits: number;
  availableUnits: number;
  maxUnitsPerInvestor: number;
  investorRemainingLimit: number;
  poolEscrowSetupId: string | null;
  transactionId: string;
  balanceBefore: number;
  balanceAfter: number;
  availableBalanceBefore: number;
};

export type PendingRedemptionRequest = {
  id: string;
  investorProfileId: string;
  spvId: string;
  units: number;
  unitPrice: number;
  status: string;
  transactionId?: string | null;
  failureReason?: string | null;
};

export type ProcessedRedemptionResult = {
  redemptionRequestId: string;
  transactionId: string;
  redeemedUnits: number;
  totalPayout: number;
  grossPayout: number;
  netPayout: number;
  interestPayout: number;
  annualInterestRate: number;
  capitalGain: number;
  stampDutyAmount: number;
  stampDutyRate: number;
  balanceBefore: number;
  balanceAfter: number;
};

type RedemptionHoldingBreakdown = {
  holdingId: string;
  ptcIssuanceId: string;
  poolFinancialsId: string | null;
  usersId: string | null;
  unitsBefore: number;
  redeemedUnits: number;
  unitsAfter: number;
  investedPerUnit: number;
  redeemedCostBasis: number;
  principalPayout: number;
  interestPayout: number;
  accruedDays: number;
  createdAt: string | null;
};

type ClosedInvestmentSnapshotPayload = {
  request: PendingRedemptionRequest;
  transactionId: string;
  redeemedUnits: number;
  redeemedCostBasis: number;
  principalPayout: number;
  interestPayout: number;
  grossPayout: number;
  netPayout: number;
  capitalGain: number;
  stampDutyAmount: number;
  annualInterestRate: number;
  poolFinancialsId: string;
  redemptionLedgerId: string;
  processedBy: string;
  holdingsBreakdown: RedemptionHoldingBreakdown[];
};

type InvestorEscrowLedgerHistoryRow = {
  id?: string;
  amount?: number | string | null;
  createdat?: Date | string | null;
  createdAt?: Date | string | null;
  metadata?: unknown;
};

type InvestorSpvLedgerEntry = {
  amount: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

export class PtcIssuanceService {
  private static readonly REDEMPTION_TIMEZONE = 'Asia/Kolkata';
  private static readonly IST_REDEMPTION_DAY_INDEX = 2;
  private static readonly IST_OFFSET_MINUTES = 330;
  private static readonly IST_INTEREST_CUTOFF_HOUR = 20;

  constructor(
    @inject('datasources.amplio')
    private datasource: AmplioDataSource,
    @repository(PtcIssuanceRepository)
    private ptcIssuanceRepository: PtcIssuanceRepository,
    @repository(InvestorPtcHoldingRepository)
    private investorPtcHoldingRepository: InvestorPtcHoldingRepository,
    @repository(InvestorEscrowAccountRepository)
    private investorEscrowAccountRepository: InvestorEscrowAccountRepository,
    @repository(InvestorEscrowLedgerRepository)
    private investorEscrowLedgerRepository: InvestorEscrowLedgerRepository,
    @repository(InvestorClosedInvestmentRepository)
    private investorClosedInvestmentRepository: InvestorClosedInvestmentRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
    @repository(PtcParametersRepository)
    private ptcParametersRepository: PtcParametersRepository,
    @repository(EscrowSetupRepository)
    private escrowSetupRepository: EscrowSetupRepository,
  ) {}

  private normalizeAmount(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(2));
  }

  private normalizeRate(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(4));
  }

  private getOptions(tx?: unknown) {
    return tx ? {transaction: tx} : undefined;
  }

  private toFiniteNumber(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private parseLedgerMetadata(metadata: unknown): Record<string, unknown> {
    if (!metadata) {
      return {};
    }

    if (typeof metadata === 'string') {
      try {
        const parsed = JSON.parse(metadata);
        return parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }

    return metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : {};
  }

  private parseLedgerCreatedAt(
    createdAtValue: Date | string | null | undefined,
  ): Date | null {
    if (!createdAtValue) {
      return null;
    }

    const parsed = new Date(createdAtValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async fetchInvestorLedgerHistoryForSpv(
    investorProfileId: string,
    spvId: string,
    type: InvestorEscrowLedgerType,
    tx: unknown,
  ): Promise<InvestorSpvLedgerEntry[]> {
    const rows = (await this.datasource.execute(
      `
      SELECT id, amount, createdat, metadata
      FROM public.investor_escrow_ledgers
      WHERE investorid = $1
        AND type = $2
        AND status = $3
        AND isdeleted = false
        AND metadata IS NOT NULL
        AND metadata->>'spvId' = $4
      ORDER BY createdat ASC, id ASC
      `,
      [investorProfileId, type, InvestorEscrowLedgerStatus.SUCCESS, spvId],
      this.getOptions(tx),
    )) as InvestorEscrowLedgerHistoryRow[];

    return rows
      .map(row => {
        const createdAt = this.parseLedgerCreatedAt(
          row.createdat ?? row.createdAt,
        );
        if (!createdAt) {
          return null;
        }

        return {
          amount: this.normalizeAmount(this.toFiniteNumber(row.amount)),
          createdAt,
          metadata: this.parseLedgerMetadata(row.metadata),
        };
      })
      .filter((row): row is InvestorSpvLedgerEntry => Boolean(row));
  }

  private validatePositiveIntegerUnits(
    requestedUnits: number,
    label = 'Requested units',
  ): number {
    if (
      typeof requestedUnits !== 'number' ||
      !Number.isFinite(requestedUnits) ||
      !Number.isInteger(requestedUnits) ||
      requestedUnits <= 0
    ) {
      throw new HttpErrors.BadRequest(`${label} must be a positive integer`);
    }

    return requestedUnits;
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string | undefined {
    const normalizedKey = String(idempotencyKey ?? '').trim();

    if (!normalizedKey) {
      return undefined;
    }

    if (normalizedKey.length < 8 || normalizedKey.length > 80) {
      throw new HttpErrors.BadRequest(
        'idempotencyKey must be between 8 and 80 characters',
      );
    }

    return normalizedKey;
  }

  private async lockBuyIdempotencyKey(
    investorProfileId: string,
    referenceId: string,
    tx: unknown,
  ): Promise<void> {
    await this.datasource.execute(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [investorProfileId, referenceId],
      this.getOptions(tx),
    );
  }

  private async findIdempotentBuyResult(
    investorProfileId: string,
    referenceId: string,
    tx: unknown,
  ): Promise<BuyUnitsResult | null> {
    const existingLedger = await this.investorEscrowLedgerRepository.findOne(
      {
        where: {
          and: [
            {investorId: investorProfileId},
            {type: InvestorEscrowLedgerType.BUY_DEBIT},
            {referenceType: 'PTC_BUY_IDEMPOTENCY'},
            {referenceId},
            {status: InvestorEscrowLedgerStatus.SUCCESS},
            {isDeleted: false},
          ],
        },
      },
      this.getOptions(tx),
    );

    const metadata =
      existingLedger?.metadata && typeof existingLedger.metadata === 'object'
        ? (existingLedger.metadata as {allocationResult?: BuyUnitsResult})
        : undefined;

    return metadata?.allocationResult ?? null;
  }

  private toIstPseudoDate(date: Date): Date {
    const offsetMs = PtcIssuanceService.IST_OFFSET_MINUTES * 60 * 1000;
    return new Date(date.getTime() + offsetMs);
  }

  private fromIstPseudoDate(date: Date): Date {
    const offsetMs = PtcIssuanceService.IST_OFFSET_MINUTES * 60 * 1000;
    return new Date(date.getTime() - offsetMs);
  }

  private getIstWeekdayIndex(date: Date): number {
    const istPseudoDate = this.toIstPseudoDate(date);
    return istPseudoDate.getUTCDay();
  }

  private getIstHourOfDay(date: Date): number {
    const istPseudoDate = this.toIstPseudoDate(date);
    return istPseudoDate.getUTCHours();
  }

  private formatIstDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: PtcIssuanceService.REDEMPTION_TIMEZONE,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  private findNextRedemptionWindowStart(fromDate: Date): Date {
    const currentWeekday = this.getIstWeekdayIndex(fromDate);
    const daysUntilRedemptionDay =
      (PtcIssuanceService.IST_REDEMPTION_DAY_INDEX - currentWeekday + 7) % 7 ||
      7;
    const istPseudoDate = this.toIstPseudoDate(fromDate);
    istPseudoDate.setUTCDate(istPseudoDate.getUTCDate() + daysUntilRedemptionDay);
    istPseudoDate.setUTCHours(0, 0, 0, 0);

    return this.fromIstPseudoDate(istPseudoDate);
  }

  private calculateAccruedInterestDays(holdingCreatedAt?: Date): number {
    if (!holdingCreatedAt) {
      return 0;
    }

    const effectiveStart = this.toIstPseudoDate(holdingCreatedAt);
    if (effectiveStart.getUTCHours() >= PtcIssuanceService.IST_INTEREST_CUTOFF_HOUR) {
      effectiveStart.setUTCDate(effectiveStart.getUTCDate() + 1);
    }
    effectiveStart.setUTCHours(0, 0, 0, 0);

    const todayStart = this.toIstPseudoDate(new Date());
    todayStart.setUTCHours(0, 0, 0, 0);

    const msPerDay = 24 * 60 * 60 * 1000;
    const dayDiff = Math.floor(
      (todayStart.getTime() - effectiveStart.getTime()) / msPerDay,
    );

    return Math.max(dayDiff, 0);
  }

  private getConfiguredRedemptionStampDutyRate(): number {
    const rawValue = Number(process.env.PTC_REDEMPTION_STAMP_DUTY_RATE ?? 0);

    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return 0;
    }

    const normalizedRate = rawValue > 1 ? rawValue / 100 : rawValue;
    return Math.min(Math.max(normalizedRate, 0), 1);
  }

  private ensureRedemptionWindowOrFail(ptcParameters: PtcParameters): void {
    const now = new Date();
    const weekdayIndex = this.getIstWeekdayIndex(now);
    const configuredHours = Number(ptcParameters.windowDurationHours ?? 24);
    const allowedHours = Math.max(1, Math.min(Math.trunc(configuredHours), 24));
    const hourOfDay = this.getIstHourOfDay(now);
    const isMonday =
      weekdayIndex === PtcIssuanceService.IST_REDEMPTION_DAY_INDEX;
    const withinHours = hourOfDay < allowedHours;

    if (isMonday && withinHours) {
      return;
    }

    const nextWindowStartsAt = this.findNextRedemptionWindowStart(now);
    throw new HttpErrors.BadRequest(
      `Redemption window is closed. Redemptions are allowed every Tuesday for ${allowedHours} hour(s) in IST. Next window starts at ${this.formatIstDateTime(
        nextWindowStartsAt,
      )}.`,
    );
  }

  private async findPoolEscrowSetupId(
    pool: PoolFinancials,
    spvApplicationId: string,
    tx?: unknown,
  ): Promise<string | null> {
    if (pool.escrowSetupId) {
      return pool.escrowSetupId;
    }

    const escrowSetup = await this.escrowSetupRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId},
            {accountType: 'collection_escrow'},
            {isActive: true},
            {isDeleted: false},
          ],
        },
        order: ['createdAt ASC'],
      },
      this.getOptions(tx),
    );

    return escrowSetup?.id ?? null;
  }

  private async fetchSpvOrFail(spvId: string, tx?: unknown): Promise<Spv> {
    return this.spvRepository.findById(spvId, undefined, this.getOptions(tx));
  }

  private async fetchPoolForSpvOrFail(
    spvId: string,
    tx?: unknown,
  ): Promise<PoolFinancials> {
    const runtimePool = await this.poolFinancialsRepository.findOne(
      {
        where: {
          and: [{spvId}, {isActive: true}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    if (runtimePool) {
      return runtimePool;
    }

    const spv = await this.fetchSpvOrFail(spvId, tx);
    const applicationPool = await this.poolFinancialsRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId: spv.spvApplicationId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      },
      this.getOptions(tx),
    );

    if (!applicationPool) {
      throw new HttpErrors.NotFound('Pool financials not found for the SPV');
    }

    if (!applicationPool.spvId) {
      await this.poolFinancialsRepository.updateById(
        applicationPool.id,
        {spvId},
        this.getOptions(tx),
      );

      return this.poolFinancialsRepository.findById(
        applicationPool.id,
        undefined,
        this.getOptions(tx),
      );
    }

    return applicationPool;
  }

  private async fetchPtcParametersForSpvOrFail(
    spv: Spv,
    tx?: unknown,
  ): Promise<PtcParameters> {
    const ptcParameters = await this.ptcParametersRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId: spv.spvApplicationId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      },
      this.getOptions(tx),
    );

    if (!ptcParameters) {
      throw new HttpErrors.NotFound('PTC parameters not found for the SPV');
    }

    return ptcParameters;
  }

  private async resolvePoolEscrowSetupId(
    pool: PoolFinancials,
    spvApplicationId: string,
    tx?: unknown,
  ): Promise<string | null> {
    if (pool.escrowSetupId) {
      return pool.escrowSetupId;
    }

    const escrowSetup = await this.escrowSetupRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId},
            {accountType: 'collection_escrow'},
            {isActive: true},
            {isDeleted: false},
          ],
        },
        order: ['createdAt ASC'],
      },
      this.getOptions(tx),
    );

    if (!escrowSetup) {
      return null;
    }

    await this.poolFinancialsRepository.updateById(
      pool.id,
      {escrowSetupId: escrowSetup.id},
      this.getOptions(tx),
    );

    return escrowSetup.id;
  }

  private async fetchInvestorProfileOrFail(
    usersId: string,
    tx?: unknown,
  ): Promise<InvestorProfile> {
    const investorProfile = await this.investorProfileRepository.findOne(
      {
        where: {
          and: [{usersId}, {isActive: true}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Active investor profile not found');
    }

    return investorProfile;
  }

  private async fetchInvestorWalletOrFail(
    investorProfileId: string,
    tx?: unknown,
  ): Promise<InvestorEscrowAccount> {
    const investorWallet = await this.investorEscrowAccountRepository.findOne(
      {
        where: {
          and: [
            {investorProfileId},
            {isActive: true},
            {isDeleted: false},
            {status: {neq: 'inactive'}},
          ],
        },
      },
      this.getOptions(tx),
    );

    if (!investorWallet) {
      throw new HttpErrors.BadRequest('Investor wallet not found');
    }

    return investorWallet;
  }

  private async fetchInvestorOwnedUnits(
    investorProfileId: string,
    spvId: string,
    tx?: unknown,
  ): Promise<number> {
    const holdings = await this.investorPtcHoldingRepository.find(
      {
        where: {
          and: [{investorProfileId}, {spvId}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    return holdings.reduce(
      (sum, holding) => sum + Number(holding.ownedUnits ?? 0),
      0,
    );
  }

  async ensureIssuanceForPoolTransaction(
    transactionId: string,
    spvId: string,
    tx?: unknown,
  ): Promise<{created: boolean; issuance: PtcIssuance | null; reason?: string}> {
    const existingIssuance = await this.ptcIssuanceRepository.findOne(
      {
        where: {
          and: [{transactionId}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    if (existingIssuance) {
      return {
        created: false,
        issuance: existingIssuance,
        reason: 'PTC issuance already exists for this transaction',
      };
    }

    const transaction = await this.transactionRepository.findById(
      transactionId,
      undefined,
      this.getOptions(tx),
    );

    if (!transaction.spvId || transaction.spvId !== spvId) {
      throw new HttpErrors.BadRequest('Transaction does not belong to the supplied SPV');
    }

    const spv = await this.fetchSpvOrFail(spvId, tx);
    const pool = await this.fetchPoolForSpvOrFail(spvId, tx);
    let ptcParameters: PtcParameters;

    try {
      ptcParameters = await this.fetchPtcParametersForSpvOrFail(spv, tx);
    } catch (error) {
      if (error instanceof HttpErrors.NotFound) {
        return {
          created: false,
          issuance: null,
          reason: 'PTC parameters are not configured for this SPV',
        };
      }

      throw error;
    }
    const unitPrice = Number(ptcParameters.faceValuePerUnit ?? 0);

    if (unitPrice <= 0) {
      return {
        created: false,
        issuance: null,
        reason: 'PTC face value is not configured',
      };
    }

    const totalUnits = Math.floor(Number(transaction.amount ?? 0) / unitPrice);

    if (totalUnits <= 0) {
      return {
        created: false,
        issuance: null,
        reason: 'Transaction amount is below the PTC unit price',
      };
    }

    const issuance = await this.ptcIssuanceRepository.create(
      {
        id: uuidv4(),
        spvId,
        poolFinancialsId: pool.id,
        transactionId: transaction.id,
        unitPrice: this.normalizeAmount(unitPrice),
        issuedAmount: this.normalizeAmount(totalUnits * unitPrice),
        totalUnits,
        soldUnits: 0,
        remainingUnits: totalUnits,
        status: 'ACTIVE',
        isActive: true,
        isDeleted: false,
      },
      this.getOptions(tx),
    );

    return {
      created: true,
      issuance,
    };
  }

  async fetchInventoryForSpv(
    spvId: string,
    usersId?: string,
    tx?: unknown,
  ): Promise<PtcInventorySummary> {
    const spv = await this.fetchSpvOrFail(spvId, tx);
    const pool = await this.fetchPoolForSpvOrFail(spvId, tx);
    const ptcParameters = await this.fetchPtcParametersForSpvOrFail(spv, tx);
    const issuances = await this.ptcIssuanceRepository.find(
      {
        where: {
          and: [{spvId}, {poolFinancialsId: pool.id}, {isDeleted: false}],
        },
        order: ['createdAt ASC'],
      },
      this.getOptions(tx),
    );

    const totalUnits = issuances.reduce(
      (sum, issuance) => sum + Number(issuance.totalUnits ?? 0),
      0,
    );
    const soldUnits = issuances.reduce(
      (sum, issuance) => sum + Number(issuance.soldUnits ?? 0),
      0,
    );
    const availableUnits = issuances.reduce(
      (sum, issuance) => sum + Number(issuance.remainingUnits ?? 0),
      0,
    );
    const maxUnitsPerInvestor = Number(ptcParameters.maxUnitsPerInvestor ?? 0);
    const investorProfile = usersId
      ? await this.fetchInvestorProfileOrFail(usersId, tx)
      : null;
    const alreadyOwnedUnits = investorProfile
      ? await this.fetchInvestorOwnedUnits(investorProfile.id, spvId, tx)
      : 0;
    const investorRemainingLimit =
      maxUnitsPerInvestor > 0
        ? Math.max(maxUnitsPerInvestor - alreadyOwnedUnits, 0)
        : availableUnits;
    const poolEscrowSetupId = await this.resolvePoolEscrowSetupId(
      pool,
      spv.spvApplicationId,
      tx,
    );
    const unitPrice = this.normalizeAmount(
      Number(issuances[0]?.unitPrice ?? ptcParameters.faceValuePerUnit ?? 0),
    );

    return {
      totalUnits,
      soldUnits,
      availableUnits,
      maxUnitsPerInvestor,
      alreadyOwnedUnits,
      investorRemainingLimit,
      unitPrice,
      soldPercentage: totalUnits
        ? this.normalizeAmount((soldUnits / totalUnits) * 100)
        : 0,
      poolEscrowSetupId,
    };
  }

  private async lockInvestorInventoryRows(
    investorProfileId: string,
    spvId: string,
    issuanceIds: string[],
    tx: unknown,
  ): Promise<void> {
    await this.datasource.execute(
      `SELECT id FROM public.investor_ptc_holdings
       WHERE investorprofileid = $1
         AND spvid = $2
         AND isdeleted = false
       FOR UPDATE`,
      [investorProfileId, spvId],
      this.getOptions(tx),
    );

    // NOTE: Use SELECT FOR UPDATE / row locking in future to prevent overselling
    // across every dependent read/write path, including aggregate inventory reads.

    if (!issuanceIds.length) {
      return;
    }

    await this.datasource.execute(
      `SELECT id FROM public.ptc_issuances
       WHERE id = ANY($1::uuid[])
       FOR UPDATE`,
      [issuanceIds],
      this.getOptions(tx),
    );
  }

  private async lockInvestorWalletRow(
    investorProfileId: string,
    tx: unknown,
  ): Promise<void> {
    await this.datasource.execute(
      `SELECT id FROM public.investor_escrow_accounts
       WHERE investorprofileid = $1
         AND isactive = true
         AND isdeleted = false
       FOR UPDATE`,
      [investorProfileId],
      this.getOptions(tx),
    );
  }

  private async fetchInvestorHoldingsForRedemption(
    investorProfileId: string,
    spvId: string,
    tx?: unknown,
  ): Promise<InvestorPtcHolding[]> {
    return this.investorPtcHoldingRepository.find(
      {
        where: {
          and: [{investorProfileId}, {spvId}, {isDeleted: false}],
        },
        order: ['createdAt ASC', 'id ASC'],
      },
      this.getOptions(tx),
    );
  }

  private async createWalletLedgerEntry(
    payload: {
      investorEscrowAccountId: string;
      investorId: string;
      type: InvestorEscrowLedgerType;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      transactionId?: string;
      referenceType: string;
      referenceId: string;
      remarks?: string;
      metadata?: object;
      createdBy?: string;
      status?: InvestorEscrowLedgerStatus;
    },
    tx: unknown,
  ): Promise<{id: string}> {
    const ledgerId = uuidv4();

    await this.investorEscrowLedgerRepository.create(
      {
        id: ledgerId,
        investorEscrowAccountId: payload.investorEscrowAccountId,
        investorId: payload.investorId,
        type: payload.type,
        amount: this.normalizeAmount(payload.amount),
        balanceBefore: this.normalizeAmount(payload.balanceBefore),
        balanceAfter: this.normalizeAmount(payload.balanceAfter),
        status: payload.status ?? InvestorEscrowLedgerStatus.SUCCESS,
        transactionId: payload.transactionId,
        referenceType: payload.referenceType,
        referenceId: payload.referenceId,
        remarks: payload.remarks,
        metadata: payload.metadata,
        createdBy: payload.createdBy,
        updatedBy: payload.createdBy,
        isDeleted: false,
      },
      this.getOptions(tx),
    );

    return {id: ledgerId};
  }

  private buildBuyAllocationPlan(
    lockedIssuances: PtcIssuance[],
    allowedUnits: number,
  ): {
    allocationPlan: BuyAllocationPlanItem[];
    allocatedUnits: number;
    totalInvestmentCost: number;
  } {
    let unitsToAllocate = allowedUnits;
    let totalInvestmentCost = 0;
    const allocationPlan: BuyAllocationPlanItem[] = [];

    for (const issuance of lockedIssuances) {
      if (unitsToAllocate <= 0) {
        break;
      }

      const availableInIssuance = Number(issuance.remainingUnits ?? 0);

      if (availableInIssuance <= 0) {
        continue;
      }

      const allocatedUnits = Math.min(unitsToAllocate, availableInIssuance);
      const costForThisBatch = this.normalizeAmount(
        allocatedUnits * Number(issuance.unitPrice ?? 0),
      );

      allocationPlan.push({
        issuance,
        allocatedUnits,
        costForThisBatch,
      });

      totalInvestmentCost = this.normalizeAmount(
        totalInvestmentCost + costForThisBatch,
      );
      unitsToAllocate -= allocatedUnits;
    }

    return {
      allocationPlan,
      allocatedUnits: allowedUnits - unitsToAllocate,
      totalInvestmentCost,
    };
  }

  private async markRedemptionRequestFailed(
    request: PendingRedemptionRequest,
    error: unknown,
  ): Promise<void> {
    request.status = 'FAILED';
    request.failureReason =
      error instanceof Error ? error.message : 'Unknown redemption processing error';
  }

  private async hasExistingClosedInvestmentSnapshot(
    redemptionRequestId: string,
    transactionId: string,
    tx: unknown,
  ): Promise<boolean> {
    const existingByRequest =
      await this.investorClosedInvestmentRepository.findOne(
        {
          where: {
            and: [{redemptionRequestId}, {isDeleted: false}],
          },
        },
        this.getOptions(tx),
      );

    if (existingByRequest) {
      return true;
    }

    const existingByTransaction =
      await this.investorClosedInvestmentRepository.findOne(
        {
          where: {
            and: [{transactionId}, {isDeleted: false}],
          },
        },
        this.getOptions(tx),
      );

    return Boolean(existingByTransaction);
  }

  private async hasSnapshotForCurrentLifecycle(
    investorProfileId: string,
    spvId: string,
    lifecycleStartAt: Date,
    tx: unknown,
  ): Promise<boolean> {
    const existingSnapshot = await this.investorClosedInvestmentRepository.findOne(
      {
        where: {
          and: [
            {investorProfileId},
            {spvId},
            {status: InvestorClosedInvestmentStatus.CLOSED},
            {isDeleted: false},
            {closedAt: {gte: lifecycleStartAt}},
          ],
        },
        order: ['closedAt DESC'],
      },
      this.getOptions(tx),
    );

    return Boolean(existingSnapshot);
  }

  private async createClosedInvestmentSnapshotOnFullRedemption(
    payload: ClosedInvestmentSnapshotPayload,
    tx: unknown,
  ): Promise<void> {
    const investorProfileId = payload.request.investorProfileId;
    const spvId = payload.request.spvId;

    const remainingUnits = await this.fetchInvestorOwnedUnits(
      investorProfileId,
      spvId,
      tx,
    );

    if (remainingUnits > 0) {
      return;
    }

    const hasExistingSnapshot = await this.hasExistingClosedInvestmentSnapshot(
      payload.request.id,
      payload.transactionId,
      tx,
    );

    if (hasExistingSnapshot) {
      return;
    }

    const redemptionLedgers = await this.fetchInvestorLedgerHistoryForSpv(
      investorProfileId,
      spvId,
      InvestorEscrowLedgerType.REDEMPTION_CREDIT,
      tx,
    );

    if (redemptionLedgers.length === 0) {
      return;
    }

    const buyLedgers = await this.fetchInvestorLedgerHistoryForSpv(
      investorProfileId,
      spvId,
      InvestorEscrowLedgerType.BUY_DEBIT,
      tx,
    );

    const buyDateCandidates = buyLedgers
      .map(ledger => ledger.createdAt)
      .filter(date => !Number.isNaN(date.getTime()));
    const holdingDateCandidates = payload.holdingsBreakdown
      .map(holding => (holding.createdAt ? new Date(holding.createdAt) : null))
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));
    const lifecycleStartDateCandidates = [
      ...buyDateCandidates,
      ...holdingDateCandidates,
    ];

    const startDate =
      lifecycleStartDateCandidates.length > 0
        ? new Date(
            Math.min(...lifecycleStartDateCandidates.map(date => date.getTime())),
          )
        : new Date();

    const hasLifecycleSnapshot = await this.hasSnapshotForCurrentLifecycle(
      investorProfileId,
      spvId,
      startDate,
      tx,
    );

    if (hasLifecycleSnapshot) {
      return;
    }

    let totalUnits = 0;
    let totalPrincipalPayout = 0;
    let totalInterestPayout = 0;
    let totalStampDutyAmount = 0;
    let totalNetPayout = 0;
    let totalGrossPayout = 0;
    let totalCapitalGain = 0;

    for (const ledger of redemptionLedgers) {
      const metadata = ledger.metadata;
      const redeemedUnits = this.toFiniteNumber(
        metadata.units ?? metadata.redeemedUnits,
      );
      const principalPayout = this.toFiniteNumber(metadata.principalPayout);
      const interestPayout = this.toFiniteNumber(metadata.interestPayout);
      const stampDutyAmount = this.toFiniteNumber(metadata.stampDutyAmount);
      const capitalGain = this.toFiniteNumber(metadata.capitalGain);
      const grossPayoutCandidate = this.toFiniteNumber(metadata.grossPayout);
      const grossPayout =
        grossPayoutCandidate > 0
          ? grossPayoutCandidate
          : principalPayout + interestPayout;

      totalUnits += redeemedUnits;
      totalPrincipalPayout += principalPayout;
      totalInterestPayout += interestPayout;
      totalStampDutyAmount += stampDutyAmount;
      totalNetPayout += this.toFiniteNumber(ledger.amount);
      totalGrossPayout += grossPayout;
      totalCapitalGain += capitalGain;
    }

    const totalInvestedAmount = buyLedgers.length
      ? this.normalizeAmount(
          buyLedgers.reduce(
            (sum, ledger) => sum + this.toFiniteNumber(ledger.amount),
            0,
          ),
        )
      : this.normalizeAmount(payload.redeemedCostBasis);

    const latestRedemptionLedger =
      redemptionLedgers[redemptionLedgers.length - 1] ?? null;
    const closedAt = latestRedemptionLedger?.createdAt ?? new Date();
    const latestRedemptionMetadata = latestRedemptionLedger?.metadata ?? {};
    const annualInterestRate = this.normalizeRate(
      this.toFiniteNumber(
        latestRedemptionMetadata.annualInterestRate ?? payload.annualInterestRate,
      ),
    );

    const lifecycleHoldings = await this.investorPtcHoldingRepository.find(
      {
        where: {
          and: [{investorProfileId}, {spvId}, {isDeleted: false}],
        },
        fields: {ptcIssuanceId: true, usersId: true},
      },
      this.getOptions(tx),
    );

    const uniquePtcIssuanceIds = Array.from(
      new Set(
        [
          ...lifecycleHoldings.map(holding => holding.ptcIssuanceId),
          ...payload.holdingsBreakdown.map(holding => holding.ptcIssuanceId),
        ]
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const investorProfile = await this.investorProfileRepository.findById(
      investorProfileId,
      {
        fields: {
          usersId: true,
        },
      },
      this.getOptions(tx),
    );

    const usersIdFromHoldings =
      lifecycleHoldings.find(holding => holding.usersId)?.usersId ??
      payload.holdingsBreakdown.find(holding => holding.usersId)?.usersId ??
      null;
    const usersId = usersIdFromHoldings ?? investorProfile.usersId ?? payload.processedBy;

    const normalizedTotalUnits = Math.max(Math.round(totalUnits), 0);
    const normalizedPrincipalPayout = this.normalizeAmount(totalPrincipalPayout);
    const normalizedInterestPayout = this.normalizeAmount(totalInterestPayout);
    const normalizedStampDutyAmount = this.normalizeAmount(totalStampDutyAmount);
    const normalizedNetPayout = this.normalizeAmount(totalNetPayout);
    const normalizedGrossPayout = this.normalizeAmount(totalGrossPayout);
    const normalizedCapitalGain = this.normalizeAmount(totalCapitalGain);
    const resolvedPoolFinancialsIdRaw = String(
      latestRedemptionMetadata.poolFinancialsId ?? payload.poolFinancialsId ?? '',
    ).trim();
    const resolvedPoolFinancialsId = resolvedPoolFinancialsIdRaw || undefined;

    await this.investorClosedInvestmentRepository.create(
      {
        investorProfileId,
        usersId,
        spvId,
        poolFinancialsId: resolvedPoolFinancialsId,
        ptcIssuanceIds: uniquePtcIssuanceIds,
        totalUnits: normalizedTotalUnits,
        totalInvestedAmount,
        totalRedeemedAmount: normalizedGrossPayout,
        principalPayout: normalizedPrincipalPayout,
        interestPayout: normalizedInterestPayout,
        grossPayout: normalizedGrossPayout,
        netPayout: normalizedNetPayout,
        capitalGain: normalizedCapitalGain,
        stampDutyAmount: normalizedStampDutyAmount,
        annualInterestRate,
        startDate,
        closedAt,
        redemptionLedgerId: payload.redemptionLedgerId,
        redemptionRequestId: payload.request.id,
        transactionId: payload.transactionId,
        status: InvestorClosedInvestmentStatus.CLOSED,
        metadata: {
          spvId,
          redemptionRequestId: payload.request.id,
          transactionId: payload.transactionId,
          aggregatedFromAllRedemptions: true,
          redemptionLedgerCount: redemptionLedgers.length,
          buyLedgerCount: buyLedgers.length,
          totalUnitsRedeemed: normalizedTotalUnits,
          totalInvestedAmount,
          totalPrincipalPayout: normalizedPrincipalPayout,
          totalInterestPayout: normalizedInterestPayout,
          totalGrossPayout: normalizedGrossPayout,
          totalNetPayout: normalizedNetPayout,
          totalCapitalGain: normalizedCapitalGain,
          totalStampDutyAmount: normalizedStampDutyAmount,
          annualInterestRate,
          holdingsBreakdown: payload.holdingsBreakdown,
          generatedBy: payload.processedBy,
        },
        isActive: true,
        isDeleted: false,
      },
      this.getOptions(tx),
    );
  }

  async buyUnits(
    currentUser: UserProfile,
    spvId: string,
    requestedUnits: number,
    options: BuyUnitsOptions = {},
  ): Promise<BuyUnitsResult> {
    const normalizedRequestedUnits =
      this.validatePositiveIntegerUnits(requestedUnits);
    const allowPartial = options.allowPartialAllocation === true;
    const idempotencyKey = this.normalizeIdempotencyKey(options.idempotencyKey);
    const idempotencyReferenceId = idempotencyKey
      ? `${spvId}:${idempotencyKey}`
      : undefined;

    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      // calculation
      const investorProfile = await this.fetchInvestorProfileOrFail(currentUser.id, tx);

      if (idempotencyReferenceId) {
        await this.lockBuyIdempotencyKey(
          investorProfile.id,
          idempotencyReferenceId,
          tx,
        );
        const idempotentResult = await this.findIdempotentBuyResult(
          investorProfile.id,
          idempotencyReferenceId,
          tx,
        );

        if (idempotentResult) {
          await tx.commit();
          return idempotentResult;
        }
      }

      await this.fetchInvestorWalletOrFail(investorProfile.id, tx);
      const pool = await this.fetchPoolForSpvOrFail(spvId, tx);
      const spv = await this.fetchSpvOrFail(spvId, tx);
      const ptcParameters = await this.fetchPtcParametersForSpvOrFail(spv, tx);
      const poolEscrowSetupId = await this.findPoolEscrowSetupId(
        pool,
        spv.spvApplicationId,
        tx,
      );

      if (!poolEscrowSetupId) {
        throw new HttpErrors.BadRequest('Pool escrow account is not configured');
      }

      const issuances = await this.ptcIssuanceRepository.find(
        {
          where: {
            and: [
              {spvId},
              {poolFinancialsId: pool.id},
              {isDeleted: false},
              {isActive: true},
            ],
          },
          order: ['createdAt ASC'],
        },
        this.getOptions(tx),
      );

      await this.lockInvestorWalletRow(investorProfile.id, tx);
      await this.lockInvestorInventoryRows(
        investorProfile.id,
        spvId,
        issuances.map(issuance => issuance.id),
        tx,
      );

      const lockedWallet = await this.fetchInvestorWalletOrFail(
        investorProfile.id,
        tx,
      );

      const lockedIssuances = await this.ptcIssuanceRepository.find(
        {
          where: {
            and: [
              {spvId},
              {poolFinancialsId: pool.id},
              {isDeleted: false},
              {isActive: true},
            ],
          },
          order: ['createdAt ASC'],
        },
        this.getOptions(tx),
      );

      const alreadyOwnedUnits = await this.fetchInvestorOwnedUnits(
        investorProfile.id,
        spvId,
        tx,
      );
      const totalUnits = lockedIssuances.reduce(
        (sum, issuance) => sum + Number(issuance.totalUnits ?? 0),
        0,
      );
      const soldUnitsBefore = lockedIssuances.reduce(
        (sum, issuance) => sum + Number(issuance.soldUnits ?? 0),
        0,
      );
      const totalAvailableUnits = lockedIssuances.reduce(
        (sum, issuance) => sum + Number(issuance.remainingUnits ?? 0),
        0,
      );
      const maxUnitsPerInvestor = Number(ptcParameters.maxUnitsPerInvestor ?? 0);
      const investorRemainingLimit =
        maxUnitsPerInvestor > 0
          ? Math.max(maxUnitsPerInvestor - alreadyOwnedUnits, 0)
          : totalAvailableUnits;
      const allowedUnits = Math.min(
        normalizedRequestedUnits,
        totalAvailableUnits,
        investorRemainingLimit,
      );

      if (allowedUnits <= 0) {
        throw new HttpErrors.BadRequest('Units not available');
      }

      if (!allowPartial && allowedUnits < normalizedRequestedUnits) {
        throw new HttpErrors.BadRequest('Full requested units are not available');
      }

      const {allocationPlan, allocatedUnits, totalInvestmentCost} =
        this.buildBuyAllocationPlan(lockedIssuances, allowedUnits);
      const finalDebitAmount = this.normalizeAmount(totalInvestmentCost);
      const balanceBefore = this.normalizeAmount(lockedWallet.currentBalance);
      const blockedBalance = this.normalizeAmount(lockedWallet.blockedBalance);
      const availableBalanceBefore = this.normalizeAmount(
        balanceBefore - blockedBalance,
      );
      const balanceAfter = this.normalizeAmount(balanceBefore - finalDebitAmount);

      // validation
      if (allocatedUnits !== allowedUnits) {
        throw new HttpErrors.Conflict('Unable to allocate the requested units');
      }

      if (finalDebitAmount <= 0) {
        throw new HttpErrors.BadRequest('Total investment cost must be greater than zero');
      }

      if (availableBalanceBefore < finalDebitAmount) {
        throw new HttpErrors.BadRequest('Insufficient available wallet balance');
      }

      if (balanceAfter < blockedBalance) {
        throw new HttpErrors.BadRequest('Insufficient available wallet balance');
      }

      // transaction
      for (const planItem of allocationPlan) {
        const availableInIssuance = Number(planItem.issuance.remainingUnits ?? 0);
        const nextSoldUnits =
          Number(planItem.issuance.soldUnits ?? 0) + planItem.allocatedUnits;
        const nextRemainingUnits = availableInIssuance - planItem.allocatedUnits;

        await this.ptcIssuanceRepository.updateById(
          planItem.issuance.id,
          {
            soldUnits: nextSoldUnits,
            remainingUnits: nextRemainingUnits,
            status: nextRemainingUnits === 0 ? 'SOLD_OUT' : 'ACTIVE',
          },
          this.getOptions(tx),
        );

        const holding = await this.investorPtcHoldingRepository.findOne(
          {
            where: {
              and: [
                {ptcIssuanceId: planItem.issuance.id},
                {investorProfileId: investorProfile.id},
                {isDeleted: false},
              ],
            },
          },
          this.getOptions(tx),
        );

        if (holding) {
          await this.investorPtcHoldingRepository.updateById(
            holding.id,
            {
              ownedUnits: Number(holding.ownedUnits ?? 0) + planItem.allocatedUnits,
              investedAmount: this.normalizeAmount(
                Number(holding.investedAmount ?? 0) + planItem.costForThisBatch,
              ),
            },
            this.getOptions(tx),
          );
        } else {
          await this.investorPtcHoldingRepository.create(
            {
              id: uuidv4(),
              ptcIssuanceId: planItem.issuance.id,
              investorProfileId: investorProfile.id,
              usersId: currentUser.id,
              spvId,
              poolFinancialsId: pool.id,
              ownedUnits: planItem.allocatedUnits,
              investedAmount: planItem.costForThisBatch,
              isActive: true,
              isDeleted: false,
            },
            this.getOptions(tx),
          );
        }
      }

      await this.investorEscrowAccountRepository.updateById(
        lockedWallet.id,
        {
          currentBalance: balanceAfter,
          blockedBalance,
        },
        this.getOptions(tx),
      );

      const transactionId = uuidv4();
      await this.createWalletLedgerEntry(
        {
          investorEscrowAccountId: lockedWallet.id,
          investorId: investorProfile.id,
          type: InvestorEscrowLedgerType.BUY_DEBIT,
          amount: finalDebitAmount,
          balanceBefore,
          balanceAfter,
          transactionId,
          referenceType: idempotencyReferenceId
            ? 'PTC_BUY_IDEMPOTENCY'
            : 'PTC_BUY',
          referenceId: idempotencyReferenceId ?? spvId,
          remarks: `Wallet debited for ${allocatedUnits} PTC unit(s)`,
          metadata: {
            spvId,
            requestedUnits: normalizedRequestedUnits,
            allocatedUnits,
            totalInvestmentCost,
            allocationResult: {
              spvId,
              requestedUnits: normalizedRequestedUnits,
              allocatedUnits,
              partialAllocation: allocatedUnits < normalizedRequestedUnits,
              totalInvestment: totalInvestmentCost,
              totalUnits,
              soldUnits: soldUnitsBefore + allocatedUnits,
              availableUnits: Math.max(totalAvailableUnits - allocatedUnits, 0),
              maxUnitsPerInvestor,
              investorRemainingLimit: Math.max(
                investorRemainingLimit - allocatedUnits,
                0,
              ),
              poolEscrowSetupId,
              transactionId,
              balanceBefore,
              balanceAfter,
              availableBalanceBefore,
            },
          },
          createdBy: currentUser.id,
        },
        tx,
      );

      await tx.commit();
      const soldUnits = soldUnitsBefore + allocatedUnits;
      const availableUnits = Math.max(totalAvailableUnits - allocatedUnits, 0);

      return {
        spvId,
        requestedUnits: normalizedRequestedUnits,
        allocatedUnits,
        partialAllocation: allocatedUnits < normalizedRequestedUnits,
        totalInvestment: totalInvestmentCost,
        totalUnits,
        soldUnits,
        availableUnits,
        maxUnitsPerInvestor,
        investorRemainingLimit: Math.max(investorRemainingLimit - allocatedUnits, 0),
        poolEscrowSetupId,
        transactionId,
        balanceBefore,
        balanceAfter,
        availableBalanceBefore,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async redeemUnits(
    currentUser: UserProfile,
    spvId: string,
    requestedUnits: number,
  ): Promise<ProcessedRedemptionResult & {
    requestedUnits: number;
    availableUnitsBefore: number;
    remainingUnits: number;
    unitPrice: number;
  }> {
    const normalizedRequestedUnits = this.validatePositiveIntegerUnits(
      requestedUnits,
      'Redeem units',
    );

    const spv = await this.fetchSpvOrFail(spvId);
    const ptcParameters = await this.fetchPtcParametersForSpvOrFail(spv);
    this.ensureRedemptionWindowOrFail(ptcParameters);

    const investorProfile = await this.fetchInvestorProfileOrFail(currentUser.id);
    const holdings = await this.fetchInvestorHoldingsForRedemption(
      investorProfile.id,
      spvId,
    );
    const activeHoldings = holdings.filter(
      holding => Number(holding.ownedUnits ?? 0) > 0,
    );
    const availableUnitsBefore = activeHoldings.reduce(
      (sum, holding) => sum + Number(holding.ownedUnits ?? 0),
      0,
    );

    if (availableUnitsBefore <= 0) {
      throw new HttpErrors.BadRequest('No active PTC units available to redeem');
    }

    if (normalizedRequestedUnits > availableUnitsBefore) {
      throw new HttpErrors.BadRequest(
        `Requested units exceed available holdings (${availableUnitsBefore})`,
      );
    }

    const totalInvestedAmount = activeHoldings.reduce(
      (sum, holding) => sum + Number(holding.investedAmount ?? 0),
      0,
    );
    const unitPrice = this.normalizeAmount(
      totalInvestedAmount / availableUnitsBefore,
    );

    if (unitPrice <= 0) {
      throw new HttpErrors.Conflict('Unable to determine redemption unit price');
    }

    const pendingRequest: PendingRedemptionRequest = {
      id: uuidv4(),
      investorProfileId: investorProfile.id,
      spvId,
      units: normalizedRequestedUnits,
      unitPrice,
      status: 'PENDING',
      transactionId: uuidv4(),
      failureReason: null,
    };

    const redemptionResult = await this.processPendingRedemption(
      pendingRequest,
      currentUser.id,
    );
    const remainingUnits = await this.fetchInvestorOwnedUnits(
      investorProfile.id,
      spvId,
    );

    return {
      ...redemptionResult,
      requestedUnits: normalizedRequestedUnits,
      availableUnitsBefore,
      remainingUnits,
      unitPrice,
    };
  }

  async processPendingRedemption(
    request: PendingRedemptionRequest,
    processedBy: string,
  ): Promise<ProcessedRedemptionResult> {
    if (request.status !== 'PENDING') {
      throw new HttpErrors.BadRequest('Redemption request is not pending');
    }

    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const normalizedRequestedUnits = Math.floor(Number(request.units ?? 0));

      if (normalizedRequestedUnits <= 0) {
        throw new HttpErrors.BadRequest('Redemption units must be greater than zero');
      }

      const transactionId = String(request.transactionId ?? '').trim();

      if (!transactionId) {
        throw new HttpErrors.BadRequest('Redemption transactionId is required');
      }

      await this.lockInvestorWalletRow(request.investorProfileId, tx);
      await this.lockInvestorInventoryRows(request.investorProfileId, request.spvId, [], tx);

      const investorWallet = await this.fetchInvestorWalletOrFail(
        request.investorProfileId,
        tx,
      );
      const holdings = await this.fetchInvestorHoldingsForRedemption(
        request.investorProfileId,
        request.spvId,
        tx,
      );
      const pool = await this.fetchPoolForSpvOrFail(request.spvId, tx);
      const annualInterestRate = Number(pool.targetYield ?? 0);
      const dailyInterestRate = Math.max(annualInterestRate, 0) / 100 / 365;

      let unitsToRedeem = normalizedRequestedUnits;
      let principalPayout = 0;
      let grossPayout = 0;
      let redeemedCostBasis = 0;
      let interestPayout = 0;
      const redeemedHoldingsBreakdown: RedemptionHoldingBreakdown[] = [];

      // Holdings are reduced using FIFO (first purchased, first sold)
      for (const holding of holdings) {
        if (unitsToRedeem <= 0) {
          break;
        }

        const ownedUnits = Number(holding.ownedUnits ?? 0);

        if (ownedUnits <= 0) {
          continue;
        }

        const redeemedUnits = Math.min(unitsToRedeem, ownedUnits);
        const investedPerUnit =
          ownedUnits > 0
            ? this.normalizeAmount(Number(holding.investedAmount ?? 0) / ownedUnits)
            : 0;
        const nextOwnedUnits = ownedUnits - redeemedUnits;

        if (nextOwnedUnits < 0) {
          throw new HttpErrors.Conflict('Holding units cannot become negative');
        }

        await this.investorPtcHoldingRepository.updateById(
          holding.id,
          {
            ownedUnits: nextOwnedUnits,
            investedAmount: this.normalizeAmount(nextOwnedUnits * investedPerUnit),
            isActive: nextOwnedUnits > 0,
          },
          this.getOptions(tx),
        );

        const redeemedPrincipal = this.normalizeAmount(
          redeemedUnits * this.normalizeAmount(request.unitPrice),
        );
        const redeemedCostForHolding = this.normalizeAmount(
          redeemedUnits * investedPerUnit,
        );
        const accruedDays = this.calculateAccruedInterestDays(
          holding.createdAt ? new Date(holding.createdAt) : undefined,
        );
        const interestForHolding = this.normalizeAmount(
          redeemedCostForHolding * dailyInterestRate * accruedDays,
        );

        principalPayout = this.normalizeAmount(principalPayout + redeemedPrincipal);
        interestPayout = this.normalizeAmount(interestPayout + interestForHolding);
        redeemedCostBasis = this.normalizeAmount(
          redeemedCostBasis + redeemedCostForHolding,
        );
        redeemedHoldingsBreakdown.push({
          holdingId: holding.id,
          ptcIssuanceId: holding.ptcIssuanceId,
          poolFinancialsId: holding.poolFinancialsId ?? null,
          usersId: holding.usersId ?? null,
          unitsBefore: ownedUnits,
          redeemedUnits,
          unitsAfter: nextOwnedUnits,
          investedPerUnit,
          redeemedCostBasis: redeemedCostForHolding,
          principalPayout: redeemedPrincipal,
          interestPayout: interestForHolding,
          accruedDays,
          createdAt: holding.createdAt
            ? new Date(holding.createdAt).toISOString()
            : null,
        });
        unitsToRedeem -= redeemedUnits;
      }

      if (unitsToRedeem !== 0) {
        throw new HttpErrors.Conflict('Redemption holdings mismatch');
      }

      grossPayout = this.normalizeAmount(principalPayout + interestPayout);
      const balanceBefore = this.normalizeAmount(investorWallet.currentBalance);
      const capitalGain = this.normalizeAmount(
        Math.max(principalPayout - redeemedCostBasis, 0),
      );
      const stampDutyRate = this.getConfiguredRedemptionStampDutyRate();
      const stampDutyAmount = this.normalizeAmount(capitalGain * stampDutyRate);
      const netPayout = this.normalizeAmount(
        Math.max(grossPayout - stampDutyAmount, 0),
      );
      const balanceAfter = this.normalizeAmount(balanceBefore + netPayout);

      await this.investorEscrowAccountRepository.updateById(
        investorWallet.id,
        {
          currentBalance: balanceAfter,
        },
        this.getOptions(tx),
      );

      const redemptionLedger = await this.createWalletLedgerEntry(
        {
          investorEscrowAccountId: investorWallet.id,
          investorId: request.investorProfileId,
          type: InvestorEscrowLedgerType.REDEMPTION_CREDIT,
          amount: netPayout,
          balanceBefore,
          balanceAfter,
          transactionId,
          referenceType: 'REDEMPTION_REQUEST',
          referenceId: request.id,
          remarks: `Wallet credited for redemption of ${normalizedRequestedUnits} unit(s)`,
          metadata: {
            redemptionRequestId: request.id,
            transactionId,
            spvId: request.spvId,
            redeemedUnits: normalizedRequestedUnits,
            principalPayout,
            interestPayout,
            annualInterestRate,
            grossPayout,
            redeemedCostBasis,
            capitalGain,
            stampDutyRate,
            stampDutyAmount,
            netPayout,
            interestCutoffHourIst: PtcIssuanceService.IST_INTEREST_CUTOFF_HOUR,
          },
          createdBy: processedBy,
        },
        tx,
      );

      await this.createClosedInvestmentSnapshotOnFullRedemption(
        {
          request,
          transactionId,
          redeemedUnits: normalizedRequestedUnits,
          redeemedCostBasis,
          principalPayout,
          interestPayout,
          grossPayout,
          netPayout,
          capitalGain,
          stampDutyAmount,
          annualInterestRate,
          poolFinancialsId: pool.id,
          redemptionLedgerId: redemptionLedger.id,
          processedBy,
          holdingsBreakdown: redeemedHoldingsBreakdown,
        },
        tx,
      );

      request.status = 'SUCCESS';
      request.failureReason = null;
      request.transactionId = transactionId;

      await tx.commit();

      return {
        redemptionRequestId: request.id,
        transactionId,
        redeemedUnits: normalizedRequestedUnits,
        totalPayout: netPayout,
        grossPayout,
        netPayout,
        interestPayout,
        annualInterestRate: this.normalizeAmount(annualInterestRate),
        capitalGain,
        stampDutyAmount,
        stampDutyRate,
        balanceBefore,
        balanceAfter,
      };
    } catch (error) {
      await tx.rollback();
      await this.markRedemptionRequestFailed(request, error);
      throw error;
    }
  }
}
