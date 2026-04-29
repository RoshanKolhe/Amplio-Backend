import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {
  InvestorClosedInvestmentStatus,
  PoolFinancials,
  PoolSummary,
  Spv,
  Transaction,
} from '../models';
import {
  InvestorEscrowLedgerStatus,
  InvestorEscrowLedgerType,
} from '../models/investor-escrow-ledger.model';
import {
  InvestorClosedInvestmentRepository,
  InvestorEscrowLedgerRepository,
  InvestorPtcHoldingRepository,
  InvestorProfileRepository,
  PtcParametersRepository,
  SpvApplicationCreditRatingRepository,
  SpvRepository,
  TransactionRepository,
} from '../repositories';
import {InvestorEscrowAccountService} from './investor-escrow-account.service';
import {PoolFinancialsService} from './pool-financials.service';
import {PoolService} from './pool.service';
import {
  BuyUnitsOptions,
  PtcInventorySummary,
  PtcIssuanceService,
} from './ptc-issuance.service';

export type InvestorInvestmentRecord = {
  id: string;
  name: string;
  spvId: string;
  poolSummary: PoolSummary | null;
  ptcInventory: PtcInventorySummary | null;
  product: {
    title: string;
    subtitle: string;
    icon: string;
    unitCost: string;
    lockIn: string;
    interestRate: string;
    interestRateLabel: string;
    payoutCycle: string;
    payoutLabel: string;
    spvId: string;
  };
  investmentDetails: {
    spvId: string;
    unitValue: string;
    unitPrice: string;
    couponRate: string;
    nextLiquidityEvent: string | null;
    finalMaturityDate: string | null;
    walletAmount: string | null;
    units: {
      selected: number;
      available: number;
      total: number;
      sold: number;
      maxPerInvestor: number;
      owned: number;
      remainingInvestorLimit: number;
    };
  };
};

export type InvestorPortfolioData = {
  summary: {
    investedTillDate: number;
    totalEarnings: number;
    annualisedReturns: number;
  };
  onlinePayment: {
    id?: string;
    spvId: string;
    poolName?: string;
    title?: string;
    totalEarnings: number;
    currentlyInvested: number;
    deployed: number;
    expectedWeeklyEarnings: number;
    interestRate: number;
    currentInvestment: number;
    expectedWeeklyInterestPayout: number;
    expectedUpcomingPayoutDate: string | null;
    interestPayoutFrequency: string;
    payoutTo: string | null;
    poolSummary: PoolSummary | null;
    availablePtcUnits?: number;
    ptcUnits?: number;
    ownedPtcUnits?: number;
    considerationPerUnit?: number;
    unitValue?: number;
    ptcFaceValue?: number;
    stampDutyPerUnit?: number;
    repaymentPerUnit?: number;
    ptcHolding?: {
      availableUnits: number;
    };
    transactions: Array<{
      id: string;
      type: string;
      date: string;
      status: 'credit' | 'debit';
      amount: number;
    }>;
  } | null;
};

export type InvestorPortfolioTransactionRecord = {
  id: string;
  spvId: string | null;
  poolName: string;
  tnsId: string;
  type: string;
  createdAt: string;
  date: string;
  status: 'credit' | 'debit';
  amount: number;
  pspStatus: string | null;
  pspSettlementStatus: string | null;
};

export type InvestorClosedInvestmentRecord = {
  id: string;
  spvId: string;
  poolName: string;
  spvName: string | null;
  originatorName: string | null;
  totalUnits: number;
  totalInvestedAmount: number;
  totalRedeemedAmount: number;
  principalPayout: number;
  grossPayout: number;
  netPayout: number;
  interestPayout: number;
  stampDutyAmount: number;
  capitalGain: number;
  totalProfit: number;
  annualInterestRate: number;
  startDate: string | null;
  closedAt: string | null;
  holdingPeriodDays: number;
  status: InvestorClosedInvestmentStatus;
  metadata?: object;
};

type CreditRatingLookup = {
  creditRatings?: {
    name?: string;
    value?: string;
  };
  creditRatingAgencies?: {
    name?: string;
  };
};

type InvestmentCatalogEntry = {
  record: InvestorInvestmentRecord;
  pool: PoolFinancials;
  poolSummary: PoolSummary;
  ptcInventory: PtcInventorySummary;
  transactions: Transaction[];
};

const ONLINE_PAYMENTS_TITLE = 'Online Payments';
const DEFAULT_PRODUCT_ICON = 'solar:card-recive-bold-duotone';
const DEFAULT_PAYOUT_LABEL = 'Interest payout';

export class InvestorInvestmentsService {
  private static readonly IST_OFFSET_MINUTES = 330;
  private static readonly IST_INTEREST_CUTOFF_HOUR = 20;

  private readonly currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });

  constructor(
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(PtcParametersRepository)
    private ptcParametersRepository: PtcParametersRepository,
    @repository(SpvApplicationCreditRatingRepository)
    private spvApplicationCreditRatingRepository: SpvApplicationCreditRatingRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
    @repository(InvestorEscrowLedgerRepository)
    private investorEscrowLedgerRepository: InvestorEscrowLedgerRepository,
    @repository(InvestorClosedInvestmentRepository)
    private investorClosedInvestmentRepository: InvestorClosedInvestmentRepository,
    @repository(InvestorPtcHoldingRepository)
    private investorPtcHoldingRepository: InvestorPtcHoldingRepository,
    @inject('service.investorEscrowAccount.service')
    private investorEscrowAccountService: InvestorEscrowAccountService,
    @inject('service.poolFinancials.service')
    private poolFinancialsService: PoolFinancialsService,
    @inject('service.pool.service')
    private poolService: PoolService,
    @inject('service.ptcIssuance.service')
    private ptcIssuanceService: PtcIssuanceService,
  ) {}

  private normalizeAmount(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(2));
  }

  private toIstPseudoDate(date: Date): Date {
    const offsetMs = InvestorInvestmentsService.IST_OFFSET_MINUTES * 60 * 1000;
    return new Date(date.getTime() + offsetMs);
  }

  private calculateAccruedInterestDays(holdingCreatedAt?: Date): number {
    if (!holdingCreatedAt) {
      return 0;
    }

    const effectiveStart = this.toIstPseudoDate(holdingCreatedAt);
    if (
      effectiveStart.getUTCHours() >=
      InvestorInvestmentsService.IST_INTEREST_CUTOFF_HOUR
    ) {
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

  private formatCurrency(value: number | undefined | null): string {
    return this.currencyFormatter.format(Number(value ?? 0));
  }

  private formatPercent(value: number | undefined | null): string {
    const percent = Number(value ?? 0);

    return `${percent.toFixed(Number.isInteger(percent) ? 0 : 2)}%`;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getPayoutConfig(windowFrequency?: string): {
    label: string;
  } {
    const normalized = String(windowFrequency ?? '')
      .trim()
      .toUpperCase();

    if (normalized.includes('MONTH')) {
      return {
        label: 'Monthly Repayment Cycle',
      };
    }

    if (normalized.includes('QUARTER')) {
      return {
        label: 'Quarterly Repayment Cycle',
      };
    }

    if (normalized.includes('DAY')) {
      return {
        label: 'Daily Repayment Cycle',
      };
    }

    return {
      label: 'Weekly Repayment Cycle',
    };
  }

  private async ensureInvestorProfileOrFail(
    currentUser: UserProfile,
  ): Promise<{id: string}> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      fields: {id: true},
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Active investor profile not found');
    }

    return {
      id: investorProfile.id,
    };
  }

  private async fetchCreditRatingSummary(
    spvApplicationId: string,
  ): Promise<{rating: string; agency: string | null}> {
    const ratingRecord = await this.spvApplicationCreditRatingRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
        include: [
          {relation: 'creditRatings', scope: {fields: {name: true, value: true}}},
          {relation: 'creditRatingAgencies', scope: {fields: {name: true}}},
        ],
      },
    );

    const ratingJson =
      ratingRecord && typeof ratingRecord.toJSON === 'function'
        ? (ratingRecord.toJSON() as CreditRatingLookup)
        : (ratingRecord as CreditRatingLookup | null);

    return {
      rating:
        ratingJson?.creditRatings?.value ??
        ratingJson?.creditRatings?.name ??
        'Unrated',
      agency: ratingJson?.creditRatingAgencies?.name ?? null,
    };
  }

  private async fetchPoolDetailsForSpv(
    spvId: string,
  ): Promise<{pool: PoolFinancials; poolSummary: PoolSummary} | null> {
    try {
      return await this.poolService.getPoolDetailsBySpvId(spvId);
    } catch (error) {
      if (error instanceof HttpErrors.NotFound) {
        return null;
      }

      throw error;
    }
  }

  private async fetchTransactionsForSpv(spvId: string): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: {
        and: [{spvId}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
      limit: 10,
    });
  }

  private async fetchSpvTimeline(
    spvId: string,
  ): Promise<{nextLiquidityEvent: string | null; finalMaturityDate: string | null}> {
    let poolFinancials = await this.poolFinancialsService.fetchBySpvId(spvId);

    if (!poolFinancials) {
      const spv = await this.spvRepository.findById(spvId);
      poolFinancials = await this.poolFinancialsService.fetchByApplicationId(
        spv.spvApplicationId,
      );
    }

    const derivedFinalMaturityDate = this.deriveFinalMaturityDate(poolFinancials);
    const nextLiquidityEvent = this.resolveTimelineDate(derivedFinalMaturityDate);
    const finalMaturityDate = this.resolveTimelineDate(derivedFinalMaturityDate);

    return {
      nextLiquidityEvent,
      finalMaturityDate,
    };
  }

  private deriveFinalMaturityDate(
    poolFinancials: PoolFinancials | null,
  ): Date | null {
    if (!poolFinancials) {
      return null;
    }

    const anchorDate = this.normalizeDate(poolFinancials.createdAt);
    const maturityDays = Number(poolFinancials.maturityDays ?? 0);

    if (!anchorDate || Number.isNaN(maturityDays) || maturityDays < 0) {
      return null;
    }

    const finalMaturityDate = new Date(anchorDate);
    finalMaturityDate.setDate(finalMaturityDate.getDate() + Math.trunc(maturityDays));

    return finalMaturityDate;
  }

  private resolveTimelineDate(
    value: Date | string | null | undefined,
  ): string | null {
    const normalizedDate = this.normalizeDate(value);

    return normalizedDate ? this.formatDate(normalizedDate) : null;
  }

  private normalizeDate(
    value: Date | string | null | undefined,
  ): Date | null {
    if (!value) {
      return null;
    }

    const normalizedDate = value instanceof Date ? value : new Date(value);

    return Number.isNaN(normalizedDate.getTime()) ? null : normalizedDate;
  }

  private calculateHoldingPeriodDays(
    startDate: Date | string | null | undefined,
    closedAt: Date | string | null | undefined,
  ): number {
    const normalizedStartDate = this.normalizeDate(startDate);
    const normalizedClosedAt = this.normalizeDate(closedAt);

    if (!normalizedStartDate || !normalizedClosedAt) {
      return 0;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const diffInDays = Math.floor(
      (normalizedClosedAt.getTime() - normalizedStartDate.getTime()) / msPerDay,
    );

    return Math.max(diffInDays, 0);
  }

  private estimatePeriodicEarnings(
    principal: number | undefined | null,
    annualYield: number | undefined | null,
    paymentsPerYear = 52,
  ): number {
    const normalizedPrincipal = Number(principal ?? 0);
    const normalizedYield = Number(annualYield ?? 0);

    if (!normalizedPrincipal || !normalizedYield || paymentsPerYear <= 0) {
      return 0;
    }

    return this.normalizeAmount(
      (normalizedPrincipal * normalizedYield) / 100 / paymentsPerYear,
    );
  }

  private mapPortfolioTransactions(
    transactions: Transaction[],
  ): NonNullable<InvestorPortfolioData['onlinePayment']>['transactions'] {
    return transactions.map(transaction => {
      const isSettled =
        String(transaction.pspSettlementStatus ?? '').toUpperCase() === 'SETTLED';

      return {
        id: transaction.id,
        type: isSettled ? 'Settlement processed' : 'Receivable funded',
        date: this.formatDate(
          transaction.settlementDate ?? transaction.createdAt ?? new Date(),
        ),
        status: isSettled ? 'credit' : 'debit',
        amount: this.normalizeAmount(transaction.amount),
      };
    });
  }

  private async buildCatalogEntry(
    currentUser: UserProfile,
    spv: Spv,
    walletAmount: string,
  ): Promise<InvestmentCatalogEntry | null> {
    const [poolDetails, ptcParameters, creditRatingSummary, transactions, timeline, ptcInventory] =
      await Promise.all([
        this.fetchPoolDetailsForSpv(spv.id),
        this.ptcParametersRepository.findOne({
          where: {
            and: [
              {spvApplicationId: spv.spvApplicationId},
              {isActive: true},
              {isDeleted: false},
            ],
          },
        }),
        this.fetchCreditRatingSummary(spv.spvApplicationId),
        this.fetchTransactionsForSpv(spv.id),
        this.fetchSpvTimeline(spv.id),
        this.ptcIssuanceService
          .fetchInventoryForSpv(spv.id, currentUser.id)
          .catch(() => null),
      ]);

    if (!poolDetails) {
      return null;
    }

    const {pool, poolSummary} = poolDetails;

    const payoutConfig = this.getPayoutConfig(ptcParameters?.windowFrequency);
    const minimumAmount =
      Number(ptcParameters?.minInvestment) ||
      Number(ptcInventory?.unitPrice ?? 0) ||
      Number(ptcParameters?.faceValuePerUnit) ||
      0;
    const unitValue =
      Number(ptcInventory?.unitPrice ?? 0) ||
      Number(ptcParameters?.faceValuePerUnit) ||
      minimumAmount;
    const availableUnits = Number(ptcInventory?.availableUnits ?? 0);
    const subtitleParts = [
      spv.originatorName ? `Originator: ${spv.originatorName}` : null,
      creditRatingSummary.rating
        ? `Rating: ${creditRatingSummary.rating}`
        : null,
      creditRatingSummary.agency
        ? `Agency: ${creditRatingSummary.agency}`
        : null,
    ].filter((part): part is string => Boolean(part));

    return {
      record: {
        id: spv.id,
        name: ONLINE_PAYMENTS_TITLE,
        spvId: spv.id,
        poolSummary,
        ptcInventory,
        product: {
          title: ONLINE_PAYMENTS_TITLE,
          subtitle:
            subtitleParts.join(' | ') || `SPV: ${spv.spvName || spv.id}`,
          icon: DEFAULT_PRODUCT_ICON,
          unitCost: this.formatCurrency(minimumAmount),
          lockIn: `${Number(pool.maturityDays ?? 0)} Days`,
          interestRate: this.formatPercent(pool.targetYield),
          interestRateLabel: `upto ${this.formatPercent(pool.targetYield)} p.a.`,
          payoutCycle: payoutConfig.label,
          payoutLabel: DEFAULT_PAYOUT_LABEL,
          spvId: spv.id,
        },
        investmentDetails: {
          spvId: spv.id,
          unitValue: this.formatCurrency(unitValue),
          unitPrice: this.formatCurrency(unitValue),
          couponRate: this.formatPercent(pool.targetYield),
          nextLiquidityEvent: timeline.nextLiquidityEvent,
          finalMaturityDate: timeline.finalMaturityDate,
          walletAmount,
          units: {
            selected: availableUnits > 0 ? 1 : 0,
            available: availableUnits,
            total: Number(ptcInventory?.totalUnits ?? 0),
            sold: Number(ptcInventory?.soldUnits ?? 0),
            maxPerInvestor: Number(ptcInventory?.maxUnitsPerInvestor ?? 0),
            owned: Number(ptcInventory?.alreadyOwnedUnits ?? 0),
            remainingInvestorLimit: Number(
              ptcInventory?.investorRemainingLimit ?? 0,
            ),
          },
        },
      },
      pool,
      poolSummary,
      ptcInventory: ptcInventory ?? {
        totalUnits: 0,
        soldUnits: 0,
        availableUnits: 0,
        maxUnitsPerInvestor: 0,
        alreadyOwnedUnits: 0,
        investorRemainingLimit: 0,
        unitPrice: unitValue,
        soldPercentage: 0,
        poolEscrowSetupId: null,
      },
      transactions,
    };
  }

  private async buildInvestmentCatalog(
    currentUser: UserProfile,
  ): Promise<InvestmentCatalogEntry[]> {
    const investorProfile = await this.ensureInvestorProfileOrFail(currentUser);
    const wallet = await this.investorEscrowAccountService.fetchByInvestorProfileId(
      investorProfile.id,
    );
    const walletAmount = this.formatCurrency(wallet?.currentBalance ?? 0);
    const spvs = await this.spvRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });

    const entries = await Promise.all(
      spvs.map(spv => this.buildCatalogEntry(currentUser, spv, walletAmount)),
    );

    return entries.filter(
      (entry): entry is InvestmentCatalogEntry => entry !== null,
    );
  }

  private buildPortfolioPreview(
    featuredInvestment: InvestmentCatalogEntry | undefined,
  ): InvestorPortfolioData['onlinePayment'] {
    if (!featuredInvestment) {
      return null;
    }

    const currentInvestment = featuredInvestment.poolSummary.metrics.outstanding;
    const deployed = featuredInvestment.poolSummary.metrics.totalFunded;
    const expectedWeeklyInterestPayout = this.estimatePeriodicEarnings(
      currentInvestment,
      featuredInvestment.pool.targetYield,
    );

    return {
      spvId: featuredInvestment.record.spvId,
      totalEarnings: 0,
      currentlyInvested: currentInvestment,
      deployed,
      expectedWeeklyEarnings: expectedWeeklyInterestPayout,
      interestRate: this.normalizeAmount(featuredInvestment.pool.targetYield),
      currentInvestment,
      expectedWeeklyInterestPayout,
      expectedUpcomingPayoutDate:
        featuredInvestment.record.investmentDetails.nextLiquidityEvent,
      interestPayoutFrequency: featuredInvestment.record.product.payoutCycle.replace(
        ' Repayment Cycle',
        '',
      ),
      payoutTo: null,
      poolSummary: featuredInvestment.poolSummary,
      transactions: this.mapPortfolioTransactions(featuredInvestment.transactions),
    };
  }

  async listInvestorInvestments(
    currentUser: UserProfile,
  ): Promise<InvestorInvestmentRecord[]> {
    const catalog = await this.buildInvestmentCatalog(currentUser);

    return catalog.map(entry => entry.record);
  }

  async getInvestorInvestmentById(
    currentUser: UserProfile,
    id: string,
  ): Promise<InvestorInvestmentRecord> {
    const catalog = await this.buildInvestmentCatalog(currentUser);
    const entry = catalog.find(item => item.record.id === id);

    if (!entry) {
      throw new HttpErrors.NotFound('Investment not found');
    }

    return entry.record;
  }

  private async getClosedPortfolioData(
    investorProfileId: string,
  ): Promise<InvestorPortfolioData> {
    const closedInvestments = await this.investorClosedInvestmentRepository.find({
      where: {
        and: [
          {investorProfileId},
          {status: InvestorClosedInvestmentStatus.CLOSED},
          {isDeleted: false},
        ],
      },
      order: ['closedAt DESC', 'createdAt DESC'],
    });

    if (!closedInvestments.length) {
      return {
        summary: {
          investedTillDate: 0,
          totalEarnings: 0,
          annualisedReturns: 0,
        },
        onlinePayment: null,
      };
    }

    const featuredClosedInvestment = closedInvestments[0];
    const totalInvestedAcrossClosures = this.normalizeAmount(
      closedInvestments.reduce(
        (sum, investment) => sum + Number(investment.totalInvestedAmount ?? 0),
        0,
      ),
    );
    const totalEarningsAcrossClosures = this.normalizeAmount(
      closedInvestments.reduce(
        (sum, investment) =>
          sum +
          (Number(investment.netPayout ?? 0) -
            Number(investment.totalInvestedAmount ?? 0)),
        0,
      ),
    );
    const weightedRateBase = closedInvestments.reduce(
      (sum, investment) => sum + Number(investment.totalInvestedAmount ?? 0),
      0,
    );
    const weightedAnnualisedReturns =
      weightedRateBase > 0
        ? this.normalizeAmount(
            closedInvestments.reduce((sum, investment) => {
              const investedAmount = Number(investment.totalInvestedAmount ?? 0);
              const annualRate = Number(investment.annualInterestRate ?? 0);

              return sum + annualRate * investedAmount;
            }, 0) / weightedRateBase,
          )
        : this.normalizeAmount(featuredClosedInvestment.annualInterestRate ?? 0);

    const spv = await this.spvRepository.findOne({
      where: {
        and: [{id: featuredClosedInvestment.spvId}, {isDeleted: false}],
      },
      fields: {
        id: true,
        spvName: true,
        originatorName: true,
      },
    });

    const ledgerRows = await this.investorEscrowLedgerRepository.find({
      where: {
        and: [
          {investorId: investorProfileId},
          {isDeleted: false},
          {status: InvestorEscrowLedgerStatus.SUCCESS},
          {
            type: {
              inq: [
                InvestorEscrowLedgerType.BUY_DEBIT,
                InvestorEscrowLedgerType.REDEMPTION_CREDIT,
              ],
            },
          },
        ],
      },
      order: ['createdAt DESC'],
    });

    const filteredLedgers = ledgerRows.filter(ledger => {
      const metadata =
        ledger.metadata && typeof ledger.metadata === 'object'
          ? (ledger.metadata as {spvId?: string})
          : undefined;
      const ledgerSpvId =
        ledger.type === InvestorEscrowLedgerType.BUY_DEBIT
          ? metadata?.spvId ?? ledger.referenceId
          : metadata?.spvId;

      return ledgerSpvId === featuredClosedInvestment.spvId;
    });

    const transactionRows = filteredLedgers.slice(0, 10).map(ledger => ({
      id: ledger.id,
      type:
        ledger.type === InvestorEscrowLedgerType.REDEMPTION_CREDIT
          ? 'PTC sell'
          : 'PTC purchase',
      date: this.formatDate(ledger.createdAt ?? new Date()),
      status:
        ledger.type === InvestorEscrowLedgerType.REDEMPTION_CREDIT
          ? ('credit' as const)
          : ('debit' as const),
      amount: this.normalizeAmount(ledger.amount),
    }));

    const totalUnits = Number(featuredClosedInvestment.totalUnits ?? 0);
    const investedAmount = this.normalizeAmount(
      featuredClosedInvestment.totalInvestedAmount,
    );
    const netPayout = this.normalizeAmount(featuredClosedInvestment.netPayout);
    const totalProfit = this.normalizeAmount(netPayout - investedAmount);
    const considerationPerUnit =
      totalUnits > 0 ? this.normalizeAmount(investedAmount / totalUnits) : 0;
    const stampDutyPerUnit =
      totalUnits > 0
        ? this.normalizeAmount(
            Number(featuredClosedInvestment.stampDutyAmount ?? 0) / totalUnits,
          )
        : 0;
    const repaymentPerUnit =
      totalUnits > 0 ? this.normalizeAmount(netPayout / totalUnits) : 0;
    const poolName =
      spv?.spvName ?? spv?.originatorName ?? ONLINE_PAYMENTS_TITLE;

    return {
      summary: {
        investedTillDate: totalInvestedAcrossClosures,
        totalEarnings: totalEarningsAcrossClosures,
        annualisedReturns: weightedAnnualisedReturns,
      },
      onlinePayment: {
        id: featuredClosedInvestment.id,
        spvId: featuredClosedInvestment.spvId,
        poolName,
        title: ONLINE_PAYMENTS_TITLE,
        totalEarnings: totalProfit,
        currentlyInvested: 0,
        deployed: investedAmount,
        expectedWeeklyEarnings: 0,
        interestRate: this.normalizeAmount(
          featuredClosedInvestment.annualInterestRate,
        ),
        currentInvestment: 0,
        expectedWeeklyInterestPayout: 0,
        expectedUpcomingPayoutDate: null,
        interestPayoutFrequency: 'Closed',
        payoutTo: null,
        poolSummary: null,
        availablePtcUnits: 0,
        ptcUnits: 0,
        ownedPtcUnits: 0,
        considerationPerUnit,
        unitValue: considerationPerUnit,
        ptcFaceValue: considerationPerUnit,
        stampDutyPerUnit,
        repaymentPerUnit,
        ptcHolding: {
          availableUnits: 0,
        },
        transactions: transactionRows,
      },
    };
  }

  async getInvestorPortfolioData(
    currentUser: UserProfile,
    tab: 'active' | 'closed' = 'active',
  ): Promise<InvestorPortfolioData> {
    const investorProfile = await this.ensureInvestorProfileOrFail(currentUser);

    if (tab === 'closed') {
      return this.getClosedPortfolioData(investorProfile.id);
    }

    const holdings = await this.investorPtcHoldingRepository.find({
      where: {
        and: [
          {investorProfileId: investorProfile.id},
          {isDeleted: false},
          {ownedUnits: {gt: 0}},
        ],
      },
      order: ['updatedAt DESC', 'createdAt DESC'],
    });

    const investedTillDate = this.normalizeAmount(
      holdings.reduce(
        (sum, holding) => sum + Number(holding.investedAmount ?? 0),
        0,
      ),
    );
    const totalOwnedUnits = holdings.reduce(
      (sum, holding) => sum + Number(holding.ownedUnits ?? 0),
      0,
    );
    const featuredHolding = holdings[0];

    if (!featuredHolding) {
      return {
        summary: {
          investedTillDate: 0,
          totalEarnings: 0,
          annualisedReturns: 0,
        },
        onlinePayment: null,
      };
    }

    const [poolDetails, spvTimeline, spv, ledgerRows] = await Promise.all([
      this.fetchPoolDetailsForSpv(featuredHolding.spvId),
      this.fetchSpvTimeline(featuredHolding.spvId),
      this.spvRepository.findById(featuredHolding.spvId),
      this.investorEscrowLedgerRepository.find({
        where: {
          and: [
            {investorId: investorProfile.id},
            {isDeleted: false},
            {status: InvestorEscrowLedgerStatus.SUCCESS},
            {
              type: {
                inq: [
                  InvestorEscrowLedgerType.BUY_DEBIT,
                  InvestorEscrowLedgerType.REDEMPTION_CREDIT,
                ],
              },
            },
          ],
        },
        order: ['createdAt DESC'],
      }),
    ]);

    const filteredLedgers = ledgerRows.filter(ledger => {
      const metadata =
        ledger.metadata && typeof ledger.metadata === 'object'
          ? (ledger.metadata as {spvId?: string})
          : undefined;
      const ledgerSpvId =
        ledger.type === InvestorEscrowLedgerType.BUY_DEBIT
          ? metadata?.spvId ?? ledger.referenceId
          : metadata?.spvId;

      return ledgerSpvId === featuredHolding.spvId;
    });

    const transactionRows = filteredLedgers.slice(0, 10).map(ledger => ({
      id: ledger.id,
      type:
        ledger.type === InvestorEscrowLedgerType.REDEMPTION_CREDIT
          ? 'PTC sell'
          : 'PTC purchase',
      date: this.formatDate(ledger.createdAt ?? new Date()),
      status:
        ledger.type === InvestorEscrowLedgerType.REDEMPTION_CREDIT
          ? ('credit' as const)
          : ('debit' as const),
      amount: this.normalizeAmount(ledger.amount),
    }));

    const interestRate = this.normalizeAmount(poolDetails?.pool.targetYield ?? 0);
    const dailyInterestRate = Math.max(interestRate, 0) / 100 / 365;
    
    // For active holdings, calculate accrued interest since purchase
    const accruedInterestActive = this.normalizeAmount(
      holdings.reduce((sum, holding) => {
        const ownedUnits = Number(holding.ownedUnits ?? 0);
        const investedAmount = Number(holding.investedAmount ?? 0);
        if (ownedUnits <= 0 || investedAmount <= 0) {
          return sum;
        }

        const interestDays = this.calculateAccruedInterestDays(
          holding.createdAt ? new Date(holding.createdAt) : undefined,
        );
        return sum + (investedAmount * dailyInterestRate * interestDays);
      }, 0),
    );

    const totalEarnings = accruedInterestActive;
    const currentPrincipal = investedTillDate;

    const expectedWeeklyInterestPayout = this.estimatePeriodicEarnings(
      currentPrincipal,
      interestRate,
    );

    const ptcParameters = await this.ptcParametersRepository.findOne({
      where: {
        and: [
          {spvApplicationId: spv.spvApplicationId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });
    const payoutLabel = this.getPayoutConfig(ptcParameters?.windowFrequency).label;
    const unitValue =
      totalOwnedUnits > 0
        ? this.normalizeAmount(investedTillDate / totalOwnedUnits)
        : 0;
    const accruedInterestPerUnit =
      totalOwnedUnits > 0
        ? this.normalizeAmount(totalEarnings / totalOwnedUnits)
        : 0;
    const repaymentPerUnit = this.normalizeAmount(unitValue + accruedInterestPerUnit);

    return {
      summary: {
        investedTillDate: currentPrincipal,
        totalEarnings,
        annualisedReturns: interestRate,
      },
      onlinePayment: {
        id: featuredHolding.id,
        spvId: featuredHolding.spvId,
        poolName: spv.spvName || spv.originatorName || ONLINE_PAYMENTS_TITLE,
        title: ONLINE_PAYMENTS_TITLE,
        totalEarnings,
        currentlyInvested: currentPrincipal,
        deployed: currentPrincipal,
        expectedWeeklyEarnings: expectedWeeklyInterestPayout,
        interestRate,
        currentInvestment: currentPrincipal,
        expectedWeeklyInterestPayout,
        expectedUpcomingPayoutDate: spvTimeline.nextLiquidityEvent,
        interestPayoutFrequency: payoutLabel.replace(' Repayment Cycle', ''),
        payoutTo: null,
        poolSummary: poolDetails?.poolSummary ?? null,
        availablePtcUnits: totalOwnedUnits,
        ptcUnits: totalOwnedUnits,
        ownedPtcUnits: totalOwnedUnits,
        considerationPerUnit: unitValue,
        unitValue,
        ptcFaceValue: unitValue,
        stampDutyPerUnit: 0,
        repaymentPerUnit,
        ptcHolding: {
          availableUnits: totalOwnedUnits,
        },
        transactions: transactionRows,
      },
    };
  }

  async listInvestorClosedInvestments(
    currentUser: UserProfile,
    params?: {
      spvId?: string;
      limit?: number;
      skip?: number;
    },
  ): Promise<{
    data: InvestorClosedInvestmentRecord[];
    totalCount: number;
    limit: number;
    skip: number;
  }> {
    const investorProfile = await this.ensureInvestorProfileOrFail(currentUser);

    const requestedLimit = Number(params?.limit ?? 10);
    const requestedSkip = Number(params?.skip ?? 0);
    const limit = Math.max(1, Math.min(Math.trunc(requestedLimit), 100));
    const skip = Math.max(0, Math.trunc(requestedSkip));
    const whereClauses: object[] = [
      {investorProfileId: investorProfile.id},
      {status: InvestorClosedInvestmentStatus.CLOSED},
      {isDeleted: false},
    ];

    if (params?.spvId) {
      whereClauses.push({spvId: params.spvId});
    }

    const closedInvestments = await this.investorClosedInvestmentRepository.find({
      where: {
        and: whereClauses,
      },
      order: ['closedAt DESC', 'createdAt DESC'],
    });

    const totalCount = closedInvestments.length;
    const paginatedRows = closedInvestments.slice(skip, skip + limit);
    const uniqueSpvIds = Array.from(
      new Set(paginatedRows.map(investment => investment.spvId).filter(Boolean)),
    ) as string[];
    const spvMap = new Map<string, Spv>();

    if (uniqueSpvIds.length > 0) {
      const spvRows = await this.spvRepository.find({
        where: {
          and: [{id: {inq: uniqueSpvIds}}, {isDeleted: false}],
        },
        fields: {
          id: true,
          spvName: true,
          originatorName: true,
        },
      });
      spvRows.forEach(spv => spvMap.set(spv.id, spv));
    }

    const data = paginatedRows.map(investment => {
      const spv = spvMap.get(investment.spvId);
      const poolName =
        spv?.spvName ?? spv?.originatorName ?? ONLINE_PAYMENTS_TITLE;
      const startDate = this.normalizeDate(investment.startDate);
      const closedAt = this.normalizeDate(investment.closedAt);

      return {
        id: investment.id,
        spvId: investment.spvId,
        poolName,
        spvName: spv?.spvName ?? null,
        originatorName: spv?.originatorName ?? null,
        totalUnits: Number(investment.totalUnits ?? 0),
        totalInvestedAmount: this.normalizeAmount(investment.totalInvestedAmount),
        totalRedeemedAmount: this.normalizeAmount(investment.totalRedeemedAmount),
        principalPayout: this.normalizeAmount(investment.principalPayout),
        grossPayout: this.normalizeAmount(investment.grossPayout),
        netPayout: this.normalizeAmount(investment.netPayout),
        interestPayout: this.normalizeAmount(investment.interestPayout),
        stampDutyAmount: this.normalizeAmount(investment.stampDutyAmount),
        capitalGain: this.normalizeAmount(investment.capitalGain),
        totalProfit: this.normalizeAmount(
          Number(investment.netPayout ?? 0) -
            Number(investment.totalInvestedAmount ?? 0),
        ),
        annualInterestRate: Number(
          Number(investment.annualInterestRate ?? 0).toFixed(4),
        ),
        startDate: startDate ? this.formatDate(startDate) : null,
        closedAt: closedAt ? this.formatDate(closedAt) : null,
        holdingPeriodDays: this.calculateHoldingPeriodDays(startDate, closedAt),
        status: InvestorClosedInvestmentStatus.CLOSED,
        metadata: investment.metadata,
      };
    });

    return {
      data,
      totalCount,
      limit,
      skip,
    };
  }

  async listInvestorPortfolioOnlineTransactions(
    currentUser: UserProfile,
    params?: {
      spvId?: string;
      limit?: number;
      skip?: number;
      tab?: string;
    },
  ): Promise<{
    data: InvestorPortfolioTransactionRecord[];
    totalCount: number;
    limit: number;
    skip: number;
  }> {
    const investorProfile = await this.ensureInvestorProfileOrFail(currentUser);

    const requestedLimit = Number(params?.limit ?? 10);
    const requestedSkip = Number(params?.skip ?? 0);
    const limit = Math.max(1, Math.min(Math.trunc(requestedLimit), 100));
    const skip = Math.max(0, Math.trunc(requestedSkip));
    const normalizedTab = String(params?.tab ?? 'active')
      .trim()
      .toLowerCase();
    const ledgerTypeFilter =
      normalizedTab === 'closed'
        ? [InvestorEscrowLedgerType.REDEMPTION_CREDIT]
        : [InvestorEscrowLedgerType.BUY_DEBIT];

    const ledgerRows = await this.investorEscrowLedgerRepository.find({
      where: {
        and: [
          {investorId: investorProfile.id},
          {isDeleted: false},
          {status: InvestorEscrowLedgerStatus.SUCCESS},
          {type: {inq: ledgerTypeFilter}},
        ],
      },
      order: ['createdAt DESC'],
    });

    const enrichedRows = ledgerRows
      .map(ledger => {
        const metadata =
          ledger.metadata && typeof ledger.metadata === 'object'
            ? (ledger.metadata as {spvId?: string})
            : undefined;
        const spvId =
          ledger.type === InvestorEscrowLedgerType.BUY_DEBIT
            ? metadata?.spvId ?? ledger.referenceId
            : metadata?.spvId ?? null;

        return {ledger, spvId};
      })
      .filter(item => (params?.spvId ? item.spvId === params.spvId : true));

    const uniqueSpvIds = Array.from(
      new Set(enrichedRows.map(item => item.spvId).filter(Boolean)),
    ) as string[];
    const spvMap = new Map<string, Spv>();
    if (uniqueSpvIds.length) {
      const spvs = await this.spvRepository.find({
        where: {id: {inq: uniqueSpvIds}},
        fields: {id: true, spvName: true, originatorName: true},
      });
      spvs.forEach(spv => spvMap.set(spv.id, spv));
    }

    const totalCount = enrichedRows.length;
    const paginatedRows = enrichedRows.slice(skip, skip + limit);
    const data = paginatedRows.map(({ledger, spvId}) => {
      const spv = spvId ? spvMap.get(spvId) : undefined;
      const poolName =
        spv?.spvName ?? spv?.originatorName ?? ONLINE_PAYMENTS_TITLE;
      const status: 'credit' | 'debit' =
        ledger.type === InvestorEscrowLedgerType.REDEMPTION_CREDIT
          ? 'credit'
          : 'debit';

      return {
        id: ledger.id,
        spvId,
        poolName,
        tnsId: ledger.transactionId ?? ledger.referenceId,
        type:
          ledger.type === InvestorEscrowLedgerType.REDEMPTION_CREDIT
            ? 'PTC sell'
            : 'PTC purchase',
        createdAt: (ledger.createdAt ?? new Date()).toISOString(),
        date: this.formatDate(ledger.createdAt ?? new Date()),
        status,
        amount: this.normalizeAmount(ledger.amount),
        pspStatus: null,
        pspSettlementStatus: null,
      };
    });

    return {
      data,
      totalCount,
      limit,
      skip,
    };
  }

  async buyInvestorInvestment(
    currentUser: UserProfile,
    spvId: string,
    units: number,
    options: BuyUnitsOptions = {},
  ) {
    const investorProfile = await this.ensureInvestorProfileOrFail(currentUser);

    // Keep escrow in sync with the approved investor bank account before purchase.
    await this.investorEscrowAccountService.getOrCreateActiveEscrowForApprovedInvestor(
      investorProfile.id,
    );

    return this.ptcIssuanceService.buyUnits(currentUser, spvId, units, options);
  }
}
