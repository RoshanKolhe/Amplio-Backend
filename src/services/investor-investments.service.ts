import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {PoolFinancials, PoolSummary, Spv, Transaction} from '../models';
import {
  InvestorProfileRepository,
  PtcParametersRepository,
  SpvApplicationCreditRatingRepository,
  SpvRepository,
  TransactionRepository,
} from '../repositories';
import {PoolFinancialsService} from './pool-financials.service';
import {PoolService} from './pool.service';
import {PtcInventorySummary, PtcIssuanceService} from './ptc-issuance.service';

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
    spvId: string;
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
    transactions: Array<{
      id: string;
      type: string;
      date: string;
      status: 'credit' | 'debit';
      amount: number;
    }>;
  } | null;
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
  ): Promise<void> {
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
          walletAmount: null,
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
    await this.ensureInvestorProfileOrFail(currentUser);
    const spvs = await this.spvRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });

    const entries = await Promise.all(
      spvs.map(spv => this.buildCatalogEntry(currentUser, spv)),
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

  async getInvestorPortfolioData(
    currentUser: UserProfile,
  ): Promise<InvestorPortfolioData> {
    await this.ensureInvestorProfileOrFail(currentUser);
    const catalog = await this.buildInvestmentCatalog(currentUser);
    const featuredInvestment = catalog[0];

    return {
      summary: {
        investedTillDate:
          featuredInvestment?.poolSummary.metrics.totalFunded ?? 0,
        totalEarnings: 0,
        annualisedReturns:
          this.normalizeAmount(featuredInvestment?.pool.targetYield) ?? 0,
      },
      onlinePayment: this.buildPortfolioPreview(featuredInvestment),
    };
  }

  async buyInvestorInvestment(
    currentUser: UserProfile,
    spvId: string,
    units: number,
  ) {
    await this.ensureInvestorProfileOrFail(currentUser);

    return this.ptcIssuanceService.buyUnits(currentUser, spvId, units);
  }
}
