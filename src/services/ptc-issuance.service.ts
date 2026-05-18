import {inject} from '@loopback/core';
import {IsolationLevel, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {AmplioDataSource} from '../datasources';
import {
  InvestorClosedInvestmentStatus,
  InvestorProfile,
  InvestorPtcHolding,
  PoolFinancials,
  PtcIssuance,
  PtcParameters,
  RedemptionPayoutStatus,
  Spv,
} from '../models';
import {
  BankDetailsRepository,
  EscrowSetupRepository,
  InvestorClosedInvestmentRepository,
  InvestorProfileRepository,
  InvestorPtcHoldingRepository,
  PoolFinancialsRepository,
  PtcIssuanceRepository,
  PtcParametersRepository,
  RedemptionPayoutRepository,
  SpvRepository,
  TransactionRepository,
} from '../repositories';
import {EscrowMovementService} from './escrow-movement.service';
import {ScheduleRedemptionPayoutPayload} from './redemption-payout.service';

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

export type UnitReservation = {
  ptcIssuanceId: string;
  reservedUnits: number;
};

export type ReserveUnitsResult = {
  reservations: UnitReservation[];
  totalReservedUnits: number;
  expiresAt: Date;
};

const RESERVATION_EXPIRY_MINUTES = 30;

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
  // Settlement scheduling — populated by redeemUnits() before processing
  submittedAt?: Date;
  submittedAfterCutoff?: boolean;
  extraInterestDays?: number;
  expectedPayoutDate?: Date;
  bankAccountId?: string;
  bankAccountSnapshot?: object;
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
  redemptionLedgerId?: string;
  processedBy: string;
  holdingsBreakdown: RedemptionHoldingBreakdown[];
};

export class PtcIssuanceService {
  private static readonly REDEMPTION_TIMEZONE = 'Asia/Kolkata';
  private static readonly DEFAULT_IST_REDEMPTION_DAY_INDEX = 2;
  private static readonly IST_OFFSET_MINUTES = 330;
  private static readonly IST_INTEREST_CUTOFF_HOUR = 17;

  constructor(
    @inject('datasources.amplio')
    private datasource: AmplioDataSource,
    @repository(PtcIssuanceRepository)
    private ptcIssuanceRepository: PtcIssuanceRepository,
    @repository(InvestorPtcHoldingRepository)
    private investorPtcHoldingRepository: InvestorPtcHoldingRepository,
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
    @inject('service.escrowMovement.service')
    private escrowMovementService: EscrowMovementService,
    @repository(BankDetailsRepository)
    private bankDetailsRepository: BankDetailsRepository,
    @repository(RedemptionPayoutRepository)
    private redemptionPayoutRepository: RedemptionPayoutRepository,
  ) {}

  private normalizeAmount(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(2));
  }

  private normalizeDecimal(
    value: number | undefined | null,
    fractionDigits: number,
  ): number {
    return Number(Number(value ?? 0).toFixed(fractionDigits));
  }

  private normalizeRate(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(4));
  }

  private getOptions(tx?: unknown) {
    return tx ? {transaction: tx} : undefined;
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

  private getConfiguredRedemptionDayIndex(): number {
    const rawValue = Number(
      process.env.PTC_REDEMPTION_DAY_INDEX ??
        PtcIssuanceService.DEFAULT_IST_REDEMPTION_DAY_INDEX,
    );

    if (!Number.isInteger(rawValue) || rawValue < 0 || rawValue > 6) {
      return PtcIssuanceService.DEFAULT_IST_REDEMPTION_DAY_INDEX;
    }

    return rawValue;
  }

  private getRedemptionWeekdayLabel(dayIndex: number): string {
    const weekdayLabels = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    return weekdayLabels[dayIndex] ?? 'Tuesday';
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
    const redemptionDayIndex = this.getConfiguredRedemptionDayIndex();
    const daysUntilRedemptionDay =
      (redemptionDayIndex - currentWeekday + 7) % 7 || 7;
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

    const totalUnits = Math.floor(
      Number(transaction.totalRecieved ?? 0) / unitPrice,
    );

    if (totalUnits <= 0) {
      return {
        created: false,
        issuance: null,
        reason: 'Transaction total received is below the PTC unit price',
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

  private allocateAmountAcrossUnitBuckets(
    bucketUnits: number[],
    unitAmount: number,
    totalAmount: number,
  ): number[] {
    const allocations = bucketUnits.map(() => 0);
    const positiveBucketIndexes = bucketUnits
      .map((units, index) => ({index, units}))
      .filter(bucket => bucket.units > 0);
    let remainingAmount = this.normalizeAmount(totalAmount);

    if (positiveBucketIndexes.length === 0) {
      if (remainingAmount !== 0) {
        throw new HttpErrors.Conflict('Amount allocation mismatch');
      }

      return allocations;
    }

    positiveBucketIndexes.forEach((bucket, position) => {
      if (position === positiveBucketIndexes.length - 1) {
        allocations[bucket.index] = Math.max(this.normalizeAmount(remainingAmount), 0);
        remainingAmount = 0;
        return;
      }

      const rawAllocation = this.normalizeAmount(bucket.units * unitAmount);
      const allocation = Math.min(Math.max(rawAllocation, 0), remainingAmount);
      allocations[bucket.index] = allocation;
      remainingAmount = this.normalizeAmount(remainingAmount - allocation);
    });

    if (this.normalizeAmount(remainingAmount) !== 0) {
      throw new HttpErrors.Conflict('Unable to allocate redemption amount');
    }

    return allocations;
  }

  private async createClosedInvestmentRecordOnRedemption(
    payload: ClosedInvestmentSnapshotPayload,
    tx: unknown,
  ): Promise<void> {
    const investorProfileId = payload.request.investorProfileId;
    const spvId = payload.request.spvId;

    const hasExistingSnapshot = await this.hasExistingClosedInvestmentSnapshot(
      payload.request.id,
      payload.transactionId,
      tx,
    );

    if (hasExistingSnapshot) {
      return;
    }

    const soldHoldings = payload.holdingsBreakdown.filter(
      holding => Number(holding.redeemedUnits ?? 0) > 0,
    );

    if (!soldHoldings.length) {
      return;
    }

    const holdingDateCandidates = soldHoldings
      .map(holding => (holding.createdAt ? new Date(holding.createdAt) : null))
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));
    const startDate =
      holdingDateCandidates.length > 0
        ? new Date(
            Math.min(...holdingDateCandidates.map(date => date.getTime())),
          )
        : new Date();
    const closedAt = new Date();
    const annualInterestRate = this.normalizeRate(payload.annualInterestRate);

    const uniquePtcIssuanceIds = Array.from(
      new Set(
        soldHoldings
          .map(holding => holding.ptcIssuanceId)
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

    const usersIdFromHoldings = soldHoldings.find(holding => holding.usersId)?.usersId ?? null;
    const usersId = usersIdFromHoldings ?? investorProfile.usersId ?? payload.processedBy;

    const normalizedTotalUnits = Math.max(Math.round(payload.redeemedUnits), 0);
    const normalizedTotalInvestedAmount = this.normalizeAmount(payload.redeemedCostBasis);
    const normalizedPrincipalPayout = this.normalizeAmount(payload.principalPayout);
    const normalizedInterestPayout = this.normalizeAmount(payload.interestPayout);
    const normalizedStampDutyAmount = this.normalizeAmount(payload.stampDutyAmount);
    const normalizedNetPayout = this.normalizeAmount(payload.netPayout);
    const normalizedGrossPayout = this.normalizeAmount(payload.grossPayout);
    const normalizedCapitalGain = this.normalizeAmount(payload.capitalGain);
    const resolvedPoolFinancialsIdRaw = String(
      payload.poolFinancialsId ??
        soldHoldings.find(holding => holding.poolFinancialsId)?.poolFinancialsId ??
        '',
    ).trim();
    const resolvedPoolFinancialsId = resolvedPoolFinancialsIdRaw || undefined;

    await this.investorClosedInvestmentRepository.create(
      {
        id: uuidv4(),
        investorProfileId,
        usersId,
        spvId,
        poolFinancialsId: resolvedPoolFinancialsId,
        ptcIssuanceIds: uniquePtcIssuanceIds,
        totalUnits: normalizedTotalUnits,
        totalInvestedAmount: normalizedTotalInvestedAmount,
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
          unitsSold: normalizedTotalUnits,
          saleAmount: normalizedPrincipalPayout,
          costBasis: normalizedTotalInvestedAmount,
          profitLoss: normalizedCapitalGain,
          totalPrincipalPayout: normalizedPrincipalPayout,
          totalInterestPayout: normalizedInterestPayout,
          totalGrossPayout: normalizedGrossPayout,
          totalNetPayout: normalizedNetPayout,
          totalCapitalGain: normalizedCapitalGain,
          totalStampDutyAmount: normalizedStampDutyAmount,
          annualInterestRate,
          holdingsBreakdown: soldHoldings,
          generatedBy: payload.processedBy,
          createdAt: closedAt.toISOString(),
        },
        isActive: true,
        isDeleted: false,
        createdAt: closedAt,
        updatedAt: closedAt,
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
      }

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

      await this.lockInvestorInventoryRows(
        investorProfile.id,
        spvId,
        issuances.map(issuance => issuance.id),
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

      // validation
      if (allocatedUnits !== allowedUnits) {
        throw new HttpErrors.Conflict('Unable to allocate the requested units');
      }

      if (finalDebitAmount <= 0) {
        throw new HttpErrors.BadRequest('Total investment cost must be greater than zero');
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

      const transactionId = uuidv4();
      await this.escrowMovementService.recordInvestmentMovement(
        {
          investorId: investorProfile.id,
          spvId,
          amount: finalDebitAmount,
          balanceBefore: 0,
          balanceAfter: 0,
          transactionId,
          referenceType: idempotencyReferenceId
            ? 'PTC_BUY_IDEMPOTENCY'
            : 'PTC_BUY',
          referenceId: idempotencyReferenceId ?? spvId,
          remarks: `PTC buy: ${allocatedUnits} unit(s) pending SPV payment verification`,
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
              balanceBefore: 0,
              balanceAfter: 0,
              availableBalanceBefore: 0,
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
        balanceBefore: 0,
        balanceAfter: 0,
        availableBalanceBefore: 0,
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
    expectedPayoutDate: Date | undefined;
    submittedAfterCutoff: boolean;
    payoutBankAccountId: string | undefined;
  }> {
    const normalizedRequestedUnits = this.validatePositiveIntegerUnits(
      requestedUnits,
      'Redeem units',
    );

    // ── Validate primary bank account BEFORE deducting any units ─────────
    const primaryBank = await this.bankDetailsRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isPrimary: true},
          {status: 1},      // 1 = approved/verified
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!primaryBank) {
      throw new HttpErrors.UnprocessableEntity(
        'No verified primary bank account found. Please add and verify a bank account before withdrawing.',
      );
    }

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

    // ── Calculate 5 PM IST settlement schedule ────────────────────────────
    const submittedAt = new Date();
    const istOffsetMs = PtcIssuanceService.IST_OFFSET_MINUTES * 60 * 1000;
    const istNow = new Date(submittedAt.getTime() + istOffsetMs);
    const submittedAfterCutoff =
      istNow.getUTCHours() >= PtcIssuanceService.IST_INTEREST_CUTOFF_HOUR;
    const extraInterestDays = submittedAfterCutoff ? 0 : 1;

    // expectedPayoutDate: T+1 if before cutoff, T+2 if after; skip weekends.
    // Use Date.UTC with IST calendar components directly — avoids the offset-subtraction
    // trap where subtracting 5:30h before truncation crosses a date boundary → T+0 bug.
    const todayIst = new Date(Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate(),
    ));
    const dayOffset = submittedAfterCutoff ? 2 : 1;
    const candidateIst = new Date(todayIst.getTime() + dayOffset * 86400000);
    const candidateDay = candidateIst.getUTCDay();
    if (candidateDay === 0) candidateIst.setUTCDate(candidateIst.getUTCDate() + 1);
    if (candidateDay === 6) candidateIst.setUTCDate(candidateIst.getUTCDate() + 2);
    const expectedPayoutDate = candidateIst; // UTC midnight representing IST calendar date

    // ── Bank snapshot — captured at submission time so immutable ─────────
    const bankAccountSnapshot = {
      id: primaryBank.id,
      bankName: primaryBank.bankName,
      bankShortCode: primaryBank.bankShortCode,
      ifscCode: primaryBank.ifscCode,
      branchName: primaryBank.branchName,
      accountType: primaryBank.accountType,
      accountHolderName: primaryBank.accountHolderName,
      accountNumber: primaryBank.accountNumber,
      verifiedAt: primaryBank.verifiedAt,
    };

    const pendingRequest: PendingRedemptionRequest = {
      id: uuidv4(),
      investorProfileId: investorProfile.id,
      spvId,
      units: normalizedRequestedUnits,
      unitPrice,
      status: 'PENDING',
      transactionId: uuidv4(),
      failureReason: null,
      submittedAt,
      submittedAfterCutoff,
      extraInterestDays,
      expectedPayoutDate,
      bankAccountId: primaryBank.id,
      bankAccountSnapshot,
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
      expectedPayoutDate,
      submittedAfterCutoff,
      payoutBankAccountId: primaryBank.id,
    };
  }

  async reserveUnitsForVerification(
    spvId: string,
    units: number,
    verificationId: string,
    externalTx?: unknown,
  ): Promise<ReserveUnitsResult> {
    const normalizedUnits = this.validatePositiveIntegerUnits(units);
    const isOwnTx = !externalTx;
    const tx = externalTx ?? await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const pool = await this.fetchPoolForSpvOrFail(spvId, tx);

      const issuanceIds = await this.ptcIssuanceRepository
        .find(
          {
            where: {
              and: [
                {spvId},
                {poolFinancialsId: pool.id},
                {isDeleted: false},
                {isActive: true},
              ],
            },
            fields: {id: true},
            order: ['createdAt ASC'],
          },
          this.getOptions(tx),
        )
        .then(rows => rows.map(r => r.id));

      if (issuanceIds.length > 0) {
        await this.datasource.execute(
          `SELECT id FROM public.ptc_issuances WHERE id = ANY($1::uuid[]) FOR UPDATE`,
          [issuanceIds],
          this.getOptions(tx),
        );
      }

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

      const totalAvailable = lockedIssuances.reduce(
        (sum, i) => sum + Number(i.remainingUnits ?? 0),
        0,
      );

      if (totalAvailable < normalizedUnits) {
        throw new HttpErrors.BadRequest(
          `Insufficient units available for reservation: ${totalAvailable} available, ${normalizedUnits} requested`,
        );
      }

      const reservations: UnitReservation[] = [];
      let remaining = normalizedUnits;

      for (const issuance of lockedIssuances) {
        if (remaining <= 0) break;

        const available = Number(issuance.remainingUnits ?? 0);
        if (available <= 0) continue;

        const toReserve = Math.min(remaining, available);
        reservations.push({ptcIssuanceId: issuance.id, reservedUnits: toReserve});

        await this.ptcIssuanceRepository.updateById(
          issuance.id,
          {
            reservedUnits: Number(issuance.reservedUnits ?? 0) + toReserve,
            remainingUnits: available - toReserve,
          },
          this.getOptions(tx),
        );

        remaining -= toReserve;
      }

      if (isOwnTx) {
        await (tx as {commit(): Promise<void>}).commit();
      }

      const expiresAt = new Date(
        Date.now() + RESERVATION_EXPIRY_MINUTES * 60 * 1000,
      );

      console.log(
        `[PtcIssuance] Reserved ${normalizedUnits} units for verification ${verificationId} across ${reservations.length} issuance(s), expires ${expiresAt.toISOString()}`,
      );

      return {reservations, totalReservedUnits: normalizedUnits, expiresAt};
    } catch (error) {
      if (isOwnTx) {
        await (tx as {rollback(): Promise<void>}).rollback();
      }
      throw error;
    }
  }

  async releaseUnitsReservation(
    reservations: UnitReservation[],
    reason?: string,
    externalTx?: unknown,
  ): Promise<void> {
    if (!reservations.length) return;

    const isOwnTx = !externalTx;
    const tx = externalTx ?? await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const issuanceIds = reservations.map(r => r.ptcIssuanceId);

      await this.datasource.execute(
        `SELECT id FROM public.ptc_issuances WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [issuanceIds],
        this.getOptions(tx),
      );

      for (const reservation of reservations) {
        const issuance = await this.ptcIssuanceRepository.findById(
          reservation.ptcIssuanceId,
          undefined,
          this.getOptions(tx),
        );

        const currentReserved = Number(issuance.reservedUnits ?? 0);
        const toRelease = Math.min(reservation.reservedUnits, currentReserved);

        if (toRelease <= 0) continue;

        const newReserved = currentReserved - toRelease;
        const newRemaining = Number(issuance.remainingUnits ?? 0) + toRelease;

        await this.ptcIssuanceRepository.updateById(
          reservation.ptcIssuanceId,
          {
            reservedUnits: newReserved,
            remainingUnits: newRemaining,
            // If previously SOLD_OUT but now has remaining, restore to ACTIVE
            status: issuance.status === 'SOLD_OUT' ? 'ACTIVE' : issuance.status,
          },
          this.getOptions(tx),
        );
      }

      if (isOwnTx) {
        await (tx as {commit(): Promise<void>}).commit();
      }

      console.log(
        `[PtcIssuance] Released reservation for ${reservations.length} issuance(s)${reason ? ` (${reason})` : ''}`,
      );
    } catch (error) {
      if (isOwnTx) {
        await (tx as {rollback(): Promise<void>}).rollback();
      }
      throw error;
    }
  }

  async allocateUnitsForVerifiedPayment(
    investorProfileId: string,
    spvId: string,
    units: number,
    verificationId: string,
    createdBy: string,
    existingReservations?: UnitReservation[],
    externalTx?: unknown,
  ): Promise<BuyUnitsResult> {
    const normalizedRequestedUnits = this.validatePositiveIntegerUnits(units);

    const isOwnTx = !externalTx;
    const tx = externalTx ?? await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      await this.lockBuyIdempotencyKey(investorProfileId, verificationId, tx);

      const statusRows = await this.datasource.execute(
        'SELECT status FROM public.spv_payment_verifications WHERE id = $1 FOR UPDATE',
        [verificationId],
        this.getOptions(tx),
      ) as Array<{status: string}>;

      if (statusRows?.[0]?.status === 'ALLOCATED') {
        if (isOwnTx) await (tx as {commit(): Promise<void>}).commit();
        return {
          spvId,
          requestedUnits: normalizedRequestedUnits,
          allocatedUnits: normalizedRequestedUnits,
          partialAllocation: false,
          totalInvestment: 0,
          totalUnits: 0,
          soldUnits: 0,
          availableUnits: 0,
          maxUnitsPerInvestor: 0,
          investorRemainingLimit: 0,
          poolEscrowSetupId: null,
          transactionId: '',
          balanceBefore: 0,
          balanceAfter: 0,
          availableBalanceBefore: 0,
        };
      }

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

      // Reservation conversion path: units were pre-deducted from remainingUnits at
      // UTR submission time. Convert reservedUnits → soldUnits without re-touching remainingUnits.
      if (existingReservations && existingReservations.length > 0) {
        const rsvIssuanceIds = existingReservations.map(r => r.ptcIssuanceId);

        await this.datasource.execute(
          `SELECT id FROM public.ptc_issuances WHERE id = ANY($1::uuid[]) FOR UPDATE`,
          [rsvIssuanceIds],
          this.getOptions(tx),
        );

        const rsvLockedIssuances = await Promise.all(
          rsvIssuanceIds.map(id =>
            this.ptcIssuanceRepository.findById(id, undefined, this.getOptions(tx)),
          ),
        );
        const rsvIssuanceMap = new Map(rsvLockedIssuances.map(i => [i.id, i]));

        let rsvTotalCost = 0;
        const rsvPlan: {
          issuance: PtcIssuance;
          allocatedUnits: number;
          costForThisBatch: number;
        }[] = [];

        for (const rsv of existingReservations) {
          const issuance = rsvIssuanceMap.get(rsv.ptcIssuanceId);
          if (!issuance) {
            throw new HttpErrors.NotFound(
              `Issuance ${rsv.ptcIssuanceId} not found during reservation conversion`,
            );
          }
          const cost = this.normalizeAmount(
            rsv.reservedUnits * Number(issuance.unitPrice ?? 0),
          );
          rsvPlan.push({issuance, allocatedUnits: rsv.reservedUnits, costForThisBatch: cost});
          rsvTotalCost = this.normalizeAmount(rsvTotalCost + cost);
        }

        const rsvAllocatedUnits = existingReservations.reduce(
          (sum, r) => sum + r.reservedUnits,
          0,
        );
        const rsvFinalDebit = this.normalizeAmount(rsvTotalCost);

        if (rsvFinalDebit <= 0) {
          throw new HttpErrors.BadRequest(
            'Total investment cost must be greater than zero',
          );
        }

        const rsvInvestorProfile = await this.investorProfileRepository.findById(
          investorProfileId,
          undefined,
          this.getOptions(tx),
        );

        for (const planItem of rsvPlan) {
          const currentReserved = Math.max(
            Number(planItem.issuance.reservedUnits ?? 0),
            0,
          );
          const nextSoldUnits =
            Number(planItem.issuance.soldUnits ?? 0) + planItem.allocatedUnits;
          const nextReservedUnits = Math.max(
            currentReserved - planItem.allocatedUnits,
            0,
          );
          const nextRemainingUnits = Number(planItem.issuance.remainingUnits ?? 0);

          await this.ptcIssuanceRepository.updateById(
            planItem.issuance.id,
            {
              soldUnits: nextSoldUnits,
              reservedUnits: nextReservedUnits,
              status:
                nextRemainingUnits === 0 && nextReservedUnits === 0
                  ? 'SOLD_OUT'
                  : 'ACTIVE',
            },
            this.getOptions(tx),
          );

          const rsvHolding = await this.investorPtcHoldingRepository.findOne(
            {
              where: {
                and: [
                  {ptcIssuanceId: planItem.issuance.id},
                  {investorProfileId},
                  {isDeleted: false},
                ],
              },
            },
            this.getOptions(tx),
          );

          if (rsvHolding) {
            await this.investorPtcHoldingRepository.updateById(
              rsvHolding.id,
              {
                ownedUnits:
                  Number(rsvHolding.ownedUnits ?? 0) + planItem.allocatedUnits,
                investedAmount: this.normalizeAmount(
                  Number(rsvHolding.investedAmount ?? 0) +
                    planItem.costForThisBatch,
                ),
              },
              this.getOptions(tx),
            );
          } else {
            await this.investorPtcHoldingRepository.create(
              {
                id: uuidv4(),
                ptcIssuanceId: planItem.issuance.id,
                investorProfileId,
                usersId: rsvInvestorProfile.usersId,
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

        const rsvTotalUnits = rsvLockedIssuances.reduce(
          (sum, i) => sum + Number(i.totalUnits ?? 0),
          0,
        );
        const rsvSoldUnitsBefore = rsvLockedIssuances.reduce(
          (sum, i) => sum + Number(i.soldUnits ?? 0),
          0,
        );
        const rsvTotalRemaining = rsvLockedIssuances.reduce(
          (sum, i) => sum + Number(i.remainingUnits ?? 0),
          0,
        );
        const rsvMaxPerInvestor = Number(ptcParameters.maxUnitsPerInvestor ?? 0);
        const rsvOwnedUnits = await this.fetchInvestorOwnedUnits(
          investorProfileId,
          spvId,
          tx,
        );
        const rsvInvestorLimit =
          rsvMaxPerInvestor > 0
            ? Math.max(rsvMaxPerInvestor - rsvOwnedUnits, 0)
            : rsvTotalRemaining;

        const rsvTransactionId = uuidv4();
        const rsvAllocationResult: BuyUnitsResult = {
          spvId,
          requestedUnits: normalizedRequestedUnits,
          allocatedUnits: rsvAllocatedUnits,
          partialAllocation: false,
          totalInvestment: rsvTotalCost,
          totalUnits: rsvTotalUnits,
          soldUnits: rsvSoldUnitsBefore + rsvAllocatedUnits,
          availableUnits: Math.max(rsvTotalRemaining, 0),
          maxUnitsPerInvestor: rsvMaxPerInvestor,
          investorRemainingLimit: Math.max(rsvInvestorLimit - rsvAllocatedUnits, 0),
          poolEscrowSetupId,
          transactionId: rsvTransactionId,
          balanceBefore: 0,
          balanceAfter: 0,
          availableBalanceBefore: 0,
        };

        await this.escrowMovementService.recordInvestmentMovement(
          {
            investorId: investorProfileId,
            spvId,
            amount: rsvFinalDebit,
            balanceBefore: 0,
            balanceAfter: 0,
            transactionId: rsvTransactionId,
            referenceType: 'SPV_PAYMENT_VERIFICATION',
            referenceId: verificationId,
            remarks: `PTC buy: ${rsvAllocatedUnits} unit(s) allocated from reservation via verified payment`,
            metadata: {
              spvId,
              requestedUnits: normalizedRequestedUnits,
              allocatedUnits: rsvAllocatedUnits,
              totalInvestmentCost: rsvTotalCost,
              verificationId,
              allocationResult: rsvAllocationResult,
              fromReservation: true,
            },
            createdBy,
          },
          tx,
        );

        if (isOwnTx) await (tx as {commit(): Promise<void>}).commit();
        return rsvAllocationResult;
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

      await this.lockInvestorInventoryRows(
        investorProfileId,
        spvId,
        issuances.map(i => i.id),
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
        investorProfileId,
        spvId,
        tx,
      );
      const totalUnits = lockedIssuances.reduce(
        (sum, i) => sum + Number(i.totalUnits ?? 0),
        0,
      );
      const soldUnitsBefore = lockedIssuances.reduce(
        (sum, i) => sum + Number(i.soldUnits ?? 0),
        0,
      );
      const totalAvailableUnits = lockedIssuances.reduce(
        (sum, i) => sum + Number(i.remainingUnits ?? 0),
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
        throw new HttpErrors.BadRequest('Units not available for allocation');
      }

      const {allocationPlan, allocatedUnits, totalInvestmentCost} =
        this.buildBuyAllocationPlan(lockedIssuances, allowedUnits);
      const finalDebitAmount = this.normalizeAmount(totalInvestmentCost);

      if (allocatedUnits !== allowedUnits) {
        throw new HttpErrors.Conflict('Unable to allocate the requested units');
      }

      if (finalDebitAmount <= 0) {
        throw new HttpErrors.BadRequest(
          'Total investment cost must be greater than zero',
        );
      }

      const investorProfile = await this.investorProfileRepository.findById(
        investorProfileId,
        undefined,
        this.getOptions(tx),
      );

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
                {investorProfileId},
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
              ownedUnits:
                Number(holding.ownedUnits ?? 0) + planItem.allocatedUnits,
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
              investorProfileId,
              usersId: investorProfile.usersId,
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

      const transactionId = uuidv4();
      const allocationResult: BuyUnitsResult = {
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
        balanceBefore: 0,
        balanceAfter: 0,
        availableBalanceBefore: 0,
      };

      await this.escrowMovementService.recordInvestmentMovement(
        {
          investorId: investorProfileId,
          spvId,
          amount: finalDebitAmount,
          balanceBefore: 0,
          balanceAfter: 0,
          transactionId,
          referenceType: 'SPV_PAYMENT_VERIFICATION',
          referenceId: verificationId,
          remarks: `PTC buy: ${allocatedUnits} unit(s) allocated via verified payment`,
          metadata: {
            spvId,
            requestedUnits: normalizedRequestedUnits,
            allocatedUnits,
            totalInvestmentCost,
            verificationId,
            allocationResult,
          },
          createdBy,
        },
        tx,
      );

      if (isOwnTx) await (tx as {commit(): Promise<void>}).commit();
      return allocationResult;
    } catch (error) {
      if (isOwnTx) await (tx as {rollback(): Promise<void>}).rollback();
      throw error;
    }
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

      // Serialise concurrent redemption requests for the same investor+SPV.
      // pg_advisory_xact_lock is released automatically at transaction end.
      await this.datasource.execute(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [request.investorProfileId, request.spvId],
        this.getOptions(tx),
      );

      await this.lockInvestorInventoryRows(
        request.investorProfileId,
        request.spvId,
        [],
        tx,
      );

      const holdings = await this.fetchInvestorHoldingsForRedemption(
        request.investorProfileId,
        request.spvId,
        tx,
      );
      const issuanceIdsToLock = Array.from(
        new Set(
          holdings
            .map(holding => holding.ptcIssuanceId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      await this.lockInvestorInventoryRows(
        request.investorProfileId,
        request.spvId,
        issuanceIdsToLock,
        tx,
      );
      const lockedIssuances = issuanceIdsToLock.length
        ? await this.ptcIssuanceRepository.find(
            {
              where: {
                and: [{id: {inq: issuanceIdsToLock}}, {isDeleted: false}],
              },
            },
            this.getOptions(tx),
          )
        : [];
      const issuanceById = new Map(
        lockedIssuances.map(issuance => [issuance.id, issuance] as const),
      );
      const pool = await this.fetchPoolForSpvOrFail(request.spvId, tx);
      const annualInterestRate = Number(pool.targetYield ?? 0);
      const dailyInterestRate = Math.max(annualInterestRate, 0) / 100 / 365;
      const activeHoldings = holdings.filter(
        holding => Number(holding.ownedUnits ?? 0) > 0,
      );
      const totalOwnedUnitsBefore = activeHoldings.reduce(
        (sum, holding) => sum + Number(holding.ownedUnits ?? 0),
        0,
      );
      const totalInvestedAmountBefore = this.normalizeAmount(
        activeHoldings.reduce(
          (sum, holding) => sum + Number(holding.investedAmount ?? 0),
          0,
        ),
      );

      if (totalOwnedUnitsBefore < normalizedRequestedUnits) {
        throw new HttpErrors.Conflict('Redemption holdings mismatch');
      }

      const averageCostPerUnit =
        totalOwnedUnitsBefore > 0
          ? this.normalizeDecimal(
              totalInvestedAmountBefore / totalOwnedUnitsBefore,
              8,
            )
          : 0;
      const normalizedUnitPrice = this.normalizeAmount(request.unitPrice);
      const totalCostBasis = this.normalizeAmount(
        averageCostPerUnit * normalizedRequestedUnits,
      );
      const totalPrincipalPayout = this.normalizeAmount(
        normalizedRequestedUnits * normalizedUnitPrice,
      );

      let unitsToRedeem = normalizedRequestedUnits;
      let principalPayout = 0;
      let grossPayout = 0;
      let redeemedCostBasis = 0;
      let interestPayout = 0;
      const redeemedHoldingsBreakdown: RedemptionHoldingBreakdown[] = [];
      const holdingRedemptionPlan = holdings.map(holding => {
        const ownedUnits = Number(holding.ownedUnits ?? 0);
        if (unitsToRedeem <= 0 || ownedUnits <= 0) {
          return {
            holding,
            ownedUnits,
            redeemedUnits: 0,
            nextOwnedUnits: ownedUnits,
          };
        }

        const redeemedUnits = Math.min(unitsToRedeem, ownedUnits);
        const nextOwnedUnits = ownedUnits - redeemedUnits;
        unitsToRedeem -= redeemedUnits;

        return {
          holding,
          ownedUnits,
          redeemedUnits,
          nextOwnedUnits,
        };
      });

      if (unitsToRedeem !== 0) {
        throw new HttpErrors.Conflict('Redemption holdings mismatch');
      }

      const redeemedCostAllocations = this.allocateAmountAcrossUnitBuckets(
        holdingRedemptionPlan.map(planItem => planItem.redeemedUnits),
        averageCostPerUnit,
        totalCostBasis,
      );
      const remainingInvestedAmount = Math.max(
        this.normalizeAmount(totalInvestedAmountBefore - totalCostBasis),
        0,
      );
      const remainingInvestedAllocations = this.allocateAmountAcrossUnitBuckets(
        holdingRedemptionPlan.map(planItem => planItem.nextOwnedUnits),
        averageCostPerUnit,
        remainingInvestedAmount,
      );
      const principalAllocations = this.allocateAmountAcrossUnitBuckets(
        holdingRedemptionPlan.map(planItem => planItem.redeemedUnits),
        normalizedUnitPrice,
        totalPrincipalPayout,
      );

      for (const [index, planItem] of holdingRedemptionPlan.entries()) {
        const {holding, ownedUnits, redeemedUnits, nextOwnedUnits} = planItem;
        const redeemedCostForHolding = redeemedCostAllocations[index] ?? 0;
        const remainingInvestedForHolding =
          remainingInvestedAllocations[index] ?? 0;
        const issuance = issuanceById.get(holding.ptcIssuanceId);

        if (nextOwnedUnits < 0) {
          throw new HttpErrors.Conflict('Holding units cannot become negative');
        }

        if (remainingInvestedForHolding < 0) {
          throw new HttpErrors.Conflict('Holding invested amount cannot become negative');
        }

        if (redeemedUnits > 0 && !issuance) {
          throw new HttpErrors.Conflict('PTC issuance not found for redeemed holding');
        }

        await this.investorPtcHoldingRepository.updateById(
          holding.id,
          {
            ownedUnits: nextOwnedUnits,
            investedAmount: remainingInvestedForHolding,
            isActive: nextOwnedUnits > 0,
          },
          this.getOptions(tx),
        );

        if (redeemedUnits <= 0) {
          continue;
        }

        const issuanceSoldUnits = Number(issuance?.soldUnits ?? 0);
        const issuanceRemainingUnits = Number(issuance?.remainingUnits ?? 0);
        const issuanceTotalUnits = Number(issuance?.totalUnits ?? 0);
        const nextIssuanceSoldUnits = issuanceSoldUnits - redeemedUnits;
        const nextIssuanceRemainingUnits = issuanceRemainingUnits + redeemedUnits;

        if (nextIssuanceSoldUnits < 0) {
          throw new HttpErrors.Conflict('PTC issuance sold units cannot become negative');
        }

        if (
          issuanceTotalUnits > 0 &&
          nextIssuanceRemainingUnits > issuanceTotalUnits
        ) {
          throw new HttpErrors.Conflict(
            'PTC issuance remaining units cannot exceed total units',
          );
        }

        await this.ptcIssuanceRepository.updateById(
          holding.ptcIssuanceId,
          {
            soldUnits: nextIssuanceSoldUnits,
            remainingUnits: nextIssuanceRemainingUnits,
            status: nextIssuanceRemainingUnits === 0 ? 'SOLD_OUT' : 'ACTIVE',
          },
          this.getOptions(tx),
        );
        if (issuance) {
          issuance.soldUnits = nextIssuanceSoldUnits;
          issuance.remainingUnits = nextIssuanceRemainingUnits;
          issuance.status =
            nextIssuanceRemainingUnits === 0 ? 'SOLD_OUT' : 'ACTIVE';
        }

        const redeemedPrincipal = principalAllocations[index] ?? 0;
        const baseDays = this.calculateAccruedInterestDays(
          holding.createdAt ? new Date(holding.createdAt) : undefined,
        );
        // Add 1 extra day if submitted before 5 PM IST (investor earns the day's interest)
        const extraInterestDays = request.extraInterestDays ?? 1;
        const accruedDays = baseDays + extraInterestDays;
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
          investedPerUnit: averageCostPerUnit,
          redeemedCostBasis: redeemedCostForHolding,
          principalPayout: redeemedPrincipal,
          interestPayout: interestForHolding,
          accruedDays,
          createdAt: holding.createdAt
            ? new Date(holding.createdAt).toISOString()
            : null,
        });
      }

      grossPayout = this.normalizeAmount(principalPayout + interestPayout);
      const capitalGain = this.normalizeAmount(principalPayout - redeemedCostBasis);
      const stampDutyRate = this.getConfiguredRedemptionStampDutyRate();
      const stampDutyAmount = this.normalizeAmount(
        Math.max(capitalGain, 0) * stampDutyRate,
      );
      const netPayout = this.normalizeAmount(
        Math.max(grossPayout - stampDutyAmount, 0),
      );

      const movementResult = await this.escrowMovementService.recordRedemptionMovement(
        {
          investorId: request.investorProfileId,
          spvId: request.spvId,
          amount: netPayout,
          balanceBefore: 0,
          balanceAfter: 0,
          transactionId,
          referenceType: 'REDEMPTION_REQUEST',
          referenceId: request.id,
          remarks: `PTC redemption: ${normalizedRequestedUnits} unit(s) pending payout`,
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
            averageCostPerUnit,
            stampDutyRate,
            stampDutyAmount,
            netPayout,
            interestCutoffHourIst: PtcIssuanceService.IST_INTEREST_CUTOFF_HOUR,
          },
          createdBy: processedBy,
        },
        tx,
      );

      await this.createClosedInvestmentRecordOnRedemption(
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
          redemptionLedgerId: undefined,
          processedBy,
          holdingsBreakdown: redeemedHoldingsBreakdown,
        },
        tx,
      );

      // ── Create scheduled payout record inside the same transaction ────────
      // This ensures the payout record and unit deduction are atomic: either
      // both commit or both roll back.
      if (request.bankAccountId) {
        const idempotencyKey =
          `${request.investorProfileId}:${request.spvId}:${transactionId}`;

        await this.redemptionPayoutRepository.create(
          {
            id: uuidv4(),
            investorProfileId: request.investorProfileId,
            spvId: request.spvId,
            transactionId,
            redemptionRequestId: request.id,
            units: normalizedRequestedUnits,
            grossPayout,
            netPayout,
            principalPayout,
            interestPayout,
            capitalGain,
            stampDutyAmount,
            stampDutyRate,
            annualInterestRate: this.normalizeAmount(annualInterestRate),
            status: RedemptionPayoutStatus.REQUESTED,
            submittedAt: request.submittedAt ?? new Date(),
            submittedAfterCutoff: request.submittedAfterCutoff ?? false,
            extraInterestDays: request.extraInterestDays ?? 1,
            expectedPayoutDate: request.expectedPayoutDate,
            bankAccountId: request.bankAccountId,
            bankAccountSnapshot: request.bankAccountSnapshot,
            idempotencyKey,
            retryCount: 0,
            isActive: true,
            isDeleted: false,
            createdBy: processedBy,
            updatedBy: processedBy,
          } as ScheduleRedemptionPayoutPayload & {id: string; status: RedemptionPayoutStatus; idempotencyKey: string; retryCount: number; isActive: boolean; isDeleted: boolean},
          this.getOptions(tx) as object,
        );
      }

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
        balanceBefore: 0,
        balanceAfter: 0,
      };
    } catch (error) {
      await tx.rollback();
      await this.markRedemptionRequestFailed(request, error);
      throw error;
    }
  }
}
