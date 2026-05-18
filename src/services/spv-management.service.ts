import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {
  EscrowSetup,
  EscrowTransactionDirection,
  PoolFinancials,
  PtcIssuance,
  SpvPaymentVerification,
  SpvPaymentVerificationStatus,
  Spv,
  SpvApplication,
  TrusteeProfiles,
} from '../models';
import {
  InvestorPtcHoldingRepository,
  EscrowSetupRepository,
  EscrowTransactionRepository,
  PoolFinancialsRepository,
  PtcIssuanceRepository,
  SpvPaymentVerificationRepository,
  SpvApplicationRepository,
  SpvRepository,
  TrusteeProfilesRepository,
} from '../repositories';

export type SpvEscrowTransactionItem = {
  amount: number;
  direction: string | null;
  transactionType: string | null;
  createdAt: Date | null;
  referenceMovementId: string | null;
  status: string | null;
};

export type SpvEscrowAccount = {
  bankName: string | null;
  accountNumber: string | null;
  maskedAccountNumber: string | null;
  ifscCode: string | null;
  branchDetails: string | null;
  currentBalance: number;
  totalCredits: number;
  totalDebits: number;
  currency: string;
  status: 'Active' | 'Inactive';
  recentTransactions: SpvEscrowTransactionItem[];
};

export type SpvManagementListItem = {
  spvId: string | null;
  spvReference: string | null;
  registrationNumber: string | null;
  name: string | null;
  issuer: string | null;
  monitoringTrustee: string | null;
  monitoringTrusteeId: string | null;
  incorporationDate: Date | null;
  status: 'Active' | 'Pending';
  activePTC: number;
  activeInvestors: number;
  outstandingValue: number;
  reserveFund: number;
  coupon: number | null;
  maturityDate: Date | null;
  totalPools: number;
  currentPoolId: string | null;
  currentPoolLimit: number | null;
  currentPoolOutstanding: number;
  currentPoolUtilizationPercent: number;
  pendingPoolApplications: number;
  canCreateNewPool: boolean;
  escrowAccount: SpvEscrowAccount | null;
};

export type SpvManagementSummary = {
  totalSpv: number;
  liveIssuances: number;
  aumManaged: number;
  totalPools: number;
  spvsEligibleForNewPool: number;
};

export type SpvManagementPoolItem = {
  poolId: string;
  applicationId: string;
  reviewStatus: number;
  status: 'Active' | 'Pending';
  poolLimit: number;
  outstanding: number;
  utilizationPercent: number;
  coupon: number | null;
  maturityDate: Date | null;
  isCurrentPool: boolean;
};

type SpvApplicationGroup = {
  key: string;
  spvIdentifier: string | null;
  spv: Spv | null;
  applications: SpvApplication[];
};

export class SpvManagementService {
  private static readonly MIN_POOL_UTILIZATION_TO_CREATE_NEW_POOL = 0;

  constructor(
    @repository(SpvApplicationRepository)
    private spvApplicationRepository: SpvApplicationRepository,
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
    @repository(EscrowSetupRepository)
    private escrowSetupRepository: EscrowSetupRepository,
    @repository(EscrowTransactionRepository)
    private escrowTransactionRepository: EscrowTransactionRepository,
    @repository(PtcIssuanceRepository)
    private ptcIssuanceRepository: PtcIssuanceRepository,
    @repository(SpvPaymentVerificationRepository)
    private spvPaymentVerificationRepository: SpvPaymentVerificationRepository,
    @repository(InvestorPtcHoldingRepository)
    private investorPtcHoldingRepository: InvestorPtcHoldingRepository,
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
  ) {}

  async getSpvManagementList(
    trusteeProfileId: string,
  ): Promise<SpvManagementListItem[]> {
    const trusteeProfile = await this.fetchTrusteeProfile(trusteeProfileId);
    const groups = this.filterRealSpvGroups(
      await this.buildApplicationGroups(trusteeProfileId),
    );

    return Promise.all(
      groups.map(group => this.buildListItem(group, trusteeProfile)),
    );
  }

  async getSpvManagementListForAdmin(): Promise<SpvManagementListItem[]> {
    const groups = this.filterRealSpvGroups(await this.buildApplicationGroups());

    return Promise.all(
      groups.map(async group => {
        const trusteeProfile = await this.resolveTrusteeProfileForGroup(group);
        return this.buildListItem(group, trusteeProfile);
      }),
    );
  }

  async getSpvManagementSummary(
    trusteeProfileId: string,
  ): Promise<SpvManagementSummary> {
    const trusteeProfile = await this.fetchTrusteeProfile(trusteeProfileId);
    const groups = this.filterRealSpvGroups(
      await this.buildApplicationGroups(trusteeProfileId),
    );

    let liveIssuances = 0;
    let aumManaged = 0;
    let totalPools = 0;
    let spvsEligibleForNewPool = 0;

    for (const group of groups) {
      const listItem = await this.buildListItem(group, trusteeProfile);

      if (listItem.status === 'Active') {
        liveIssuances += 1;
      }

      aumManaged += listItem.outstandingValue;
      totalPools += listItem.totalPools;

      if (listItem.canCreateNewPool) {
        spvsEligibleForNewPool += 1;
      }
    }

    return {
      totalSpv: groups.length,
      liveIssuances,
      aumManaged: this.normalizeAmount(aumManaged),
      totalPools,
      spvsEligibleForNewPool,
    };
  }

  async getSpvManagementSummaryForAdmin(): Promise<SpvManagementSummary> {
    const groups = this.filterRealSpvGroups(await this.buildApplicationGroups());

    let liveIssuances = 0;
    let aumManaged = 0;
    let totalPools = 0;
    let spvsEligibleForNewPool = 0;

    for (const group of groups) {
      const trusteeProfile = await this.resolveTrusteeProfileForGroup(group);
      const listItem = await this.buildListItem(group, trusteeProfile);

      if (listItem.status === 'Active') {
        liveIssuances += 1;
      }

      aumManaged += listItem.outstandingValue;
      totalPools += listItem.totalPools;

      if (listItem.canCreateNewPool) {
        spvsEligibleForNewPool += 1;
      }
    }

    return {
      totalSpv: groups.length,
      liveIssuances,
      aumManaged: this.normalizeAmount(aumManaged),
      totalPools,
      spvsEligibleForNewPool,
    };
  }

  async getEscrowSummary(spvId: string): Promise<SpvEscrowAccount | null> {
    const spv = await this.spvRepository.findOne({
      where: {
        and: [{id: spvId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!spv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    const applications = await this.spvApplicationRepository.find({
      where: {
        and: [
          {isActive: true},
          {isDeleted: false},
          {
            or: [{id: spv.spvApplicationId}, {linkedSpvId: spvId}],
          },
        ],
      },
      order: ['createdAt DESC'],
    });
    const group: SpvApplicationGroup = {
      key: spvId,
      spvIdentifier: spvId,
      spv,
      applications,
    };
    const pools = await this.findPoolsForGroup(group);
    const currentPool = this.pickCurrentPool(group, pools);

    return this.buildEscrowAccount(group, currentPool);
  }

  private async fetchTrusteeProfile(
    trusteeProfileId: string,
  ): Promise<TrusteeProfiles> {
    return this.trusteeProfilesRepository.findById(trusteeProfileId);
  }

  async getSpvPools(
    trusteeProfileId: string,
    spvId: string,
  ): Promise<SpvManagementPoolItem[]> {
    const groups = this.filterRealSpvGroups(
      await this.buildApplicationGroups(trusteeProfileId),
    );
    const group = groups.find(
      item => item.spv?.id === spvId || item.spvIdentifier === spvId,
    );

    if (!group?.spv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    const pools = await this.findPoolsForGroup(group);
    const currentPool = this.pickCurrentPool(group, pools);

    return pools.map(pool => {
      const reviewStatus =
        group.applications.find(
          application => application.id === pool.spvApplicationId,
        )?.status ?? 0;
      const utilizationPercent = this.calculatePoolUtilizationPercent(pool);

      return {
        poolId: pool.id,
        applicationId: pool.spvApplicationId,
        reviewStatus,
        status: reviewStatus === 1 ? 'Active' : 'Pending',
        poolLimit: this.toFiniteNumber(pool.poolLimit),
        outstanding: this.toFiniteNumber(pool.outstanding),
        utilizationPercent,
        coupon:
          typeof pool.targetYield === 'number' ? pool.targetYield : null,
        maturityDate: this.deriveMaturityDate(pool),
        isCurrentPool: currentPool?.id === pool.id,
      };
    });
  }

  async getSpvPoolsForAdmin(spvId: string): Promise<SpvManagementPoolItem[]> {
    const groups = this.filterRealSpvGroups(await this.buildApplicationGroups());
    const group = groups.find(
      item => item.spv?.id === spvId || item.spvIdentifier === spvId,
    );

    if (!group?.spv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    const pools = await this.findPoolsForGroup(group);
    const currentPool = this.pickCurrentPool(group, pools);

    return pools.map(pool => {
      const reviewStatus =
        group.applications.find(
          application => application.id === pool.spvApplicationId,
        )?.status ?? 0;
      const utilizationPercent = this.calculatePoolUtilizationPercent(pool);

      return {
        poolId: pool.id,
        applicationId: pool.spvApplicationId,
        reviewStatus,
        status: reviewStatus === 1 ? 'Active' : 'Pending',
        poolLimit: this.toFiniteNumber(pool.poolLimit),
        outstanding: this.toFiniteNumber(pool.outstanding),
        utilizationPercent,
        coupon:
          typeof pool.targetYield === 'number' ? pool.targetYield : null,
        maturityDate: this.deriveMaturityDate(pool),
        isCurrentPool: currentPool?.id === pool.id,
      };
    });
  }

  async getUnallocatedFunds(
    trusteeProfileId: string,
    spvId: string,
  ): Promise<SpvPaymentVerification[]> {
    await this.findManagedSpvGroup(trusteeProfileId, spvId);

    return this.spvPaymentVerificationRepository.find({
      where: {
        and: [
          {spvId},
          {isDeleted: false},
          {
            status: {
              inq: [
                SpvPaymentVerificationStatus.VERIFIED,
                SpvPaymentVerificationStatus.AUTO_VERIFIED,
              ],
            },
          },
        ],
      },
      order: ['verifiedAt DESC'],
      include: ['investorProfile', 'spv'],
      limit: 200,
    });
  }

  async getUnallocatedFundsForAdmin(
    spvId: string,
  ): Promise<SpvPaymentVerification[]> {
    const groups = this.filterRealSpvGroups(await this.buildApplicationGroups());
    const group = groups.find(
      item => item.spv?.id === spvId || item.spvIdentifier === spvId,
    );

    if (!group?.spv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    return this.spvPaymentVerificationRepository.find({
      where: {
        and: [
          {spvId: group.spv.id},
          {isDeleted: false},
          {
            status: {
              inq: [
                SpvPaymentVerificationStatus.VERIFIED,
                SpvPaymentVerificationStatus.AUTO_VERIFIED,
              ],
            },
          },
        ],
      },
      order: ['verifiedAt DESC'],
      include: ['investorProfile', 'spv'],
      limit: 200,
    });
  }

  private async fetchTrusteeApplications(
    trusteeProfileId: string,
  ): Promise<SpvApplication[]> {
    return this.spvApplicationRepository.find({
      where: {
        and: [
          {trusteeProfilesId: trusteeProfileId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      order: ['createdAt DESC'],
    });
  }

  private async fetchAllActiveApplications(): Promise<SpvApplication[]> {
    return this.spvApplicationRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });
  }

  private async buildApplicationGroups(
    trusteeProfileId?: string,
  ): Promise<SpvApplicationGroup[]> {
    const applications = trusteeProfileId
      ? await this.fetchTrusteeApplications(trusteeProfileId)
      : await this.fetchAllActiveApplications();
    const groups = new Map<string, SpvApplicationGroup>();

    for (const application of applications) {
      const spv = await this.findSpvForApplication(application);
      const linkedSpvId = this.normalizeString(application.linkedSpvId);
      const key =
        spv?.id ??
        (linkedSpvId ? `linked:${linkedSpvId}` : `application:${application.id}`);
      const existingGroup = groups.get(key);

      if (existingGroup) {
        existingGroup.applications.push(application);
        continue;
      }

      groups.set(key, {
        key,
        spvIdentifier: spv?.id ?? linkedSpvId ?? application.id,
        spv,
        applications: [application],
      });
    }

    return Array.from(groups.values());
  }

  private async findManagedSpvGroup(
    trusteeProfileId: string,
    spvId: string,
  ): Promise<SpvApplicationGroup> {
    const groups = this.filterRealSpvGroups(
      await this.buildApplicationGroups(trusteeProfileId),
    );
    const group = groups.find(
      item => item.spv?.id === spvId || item.spvIdentifier === spvId,
    );

    if (!group?.spv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    return group;
  }

  private filterRealSpvGroups(
    groups: SpvApplicationGroup[],
  ): SpvApplicationGroup[] {
    return groups.filter(group => Boolean(group.spv?.id));
  }

  private async resolveTrusteeProfileForGroup(
    group: SpvApplicationGroup,
  ): Promise<TrusteeProfiles | null> {
    const trusteeProfileId = group.applications[0]?.trusteeProfilesId;

    if (!trusteeProfileId) {
      return null;
    }

    return this.trusteeProfilesRepository.findById(trusteeProfileId);
  }

  private async buildListItem(
    group: SpvApplicationGroup,
    trusteeProfile: TrusteeProfiles | null,
  ): Promise<SpvManagementListItem> {
    const [pools, ptcs] = await Promise.all([
      this.findPoolsForGroup(group),
      this.findPtcsForSpv(group.spv),
    ]);
    const allocatedPtcs = this.filterAllocatedPtcs(ptcs);
    const activeInvestors = await this.countActiveInvestors(
      group.spv,
      allocatedPtcs,
    );
    const currentPool = this.pickCurrentPool(group, pools);
    const pendingPoolApplications = group.applications.filter(
      application =>
        application.linkedSpvId === group.spv?.id && application.status === 0,
    ).length;
    const currentPoolUtilizationPercent =
      this.calculatePoolUtilizationPercent(currentPool);
    const escrowAccount = group.spv?.id
      ? await this.getEscrowSummary(group.spv.id)
      : null;

    return {
      spvId: group.spv?.id ?? null,
      spvReference: group.spv?.id ?? group.spvIdentifier,
      registrationNumber: group.spv?.registrationNumber ?? null,
      name:
        group.spv?.spvName ??
        (group.spvIdentifier && !this.isUuid(group.spvIdentifier)
          ? group.spvIdentifier
          : null),
      issuer: group.spv?.originatorName ?? null,
      monitoringTrustee: trusteeProfile?.legalEntityName ?? null,
      monitoringTrusteeId: trusteeProfile?.id ?? null,
      incorporationDate: group.spv?.incorporationDate ?? null,
      status: group.applications.some(application => application.status === 1)
        ? 'Active'
        : 'Pending',
      activePTC: allocatedPtcs.length,
      activeInvestors,
      outstandingValue: this.sumAllocatedAum(allocatedPtcs),
      reserveFund: this.toFiniteNumber(currentPool?.reserveAmount),
      coupon:
        typeof currentPool?.targetYield === 'number'
          ? currentPool.targetYield
          : null,
      maturityDate: this.deriveMaturityDate(currentPool),
      totalPools: pools.length,
      currentPoolId: currentPool?.id ?? null,
      currentPoolLimit:
        currentPool && typeof currentPool.poolLimit === 'number'
          ? currentPool.poolLimit
          : null,
      currentPoolOutstanding: this.toFiniteNumber(currentPool?.outstanding),
      currentPoolUtilizationPercent,
      pendingPoolApplications,
      canCreateNewPool:
        Boolean(group.spv?.id) &&
        currentPoolUtilizationPercent >=
          SpvManagementService.MIN_POOL_UTILIZATION_TO_CREATE_NEW_POOL &&
        pendingPoolApplications === 0,
      escrowAccount,
    };
  }

  private async buildEscrowAccount(
    group: SpvApplicationGroup,
    currentPool: PoolFinancials | null,
  ): Promise<SpvEscrowAccount | null> {
    if (!group.spv?.id) {
      return null;
    }

    const [escrowSetup, matchedTransactions] = await Promise.all([
      this.findEscrowSetupForGroup(group, currentPool),
      this.escrowTransactionRepository.find({
        where: {
          and: [
            {spvId: group.spv.id},
            {isActive: true},
            {isDeleted: false},
            {status: 'MATCHED'},
          ],
        },
        order: ['createdAt DESC'],
      }),
    ]);

    if (!escrowSetup && matchedTransactions.length === 0) {
      return null;
    }

    let totalCredits = 0;
    let totalDebits = 0;

    for (const transaction of matchedTransactions) {
      const amount = this.toFiniteNumber(transaction.amount);

      if (transaction.direction === EscrowTransactionDirection.DEBIT) {
        totalDebits += amount;
      }

      if (transaction.direction === EscrowTransactionDirection.CREDIT) {
        totalCredits += amount;
      }
    }

    totalCredits = this.normalizeAmount(totalCredits);
    totalDebits = this.normalizeAmount(totalDebits);

    return {
      bankName: escrowSetup?.bankName ?? null,
      accountNumber: this.maskAccountNumber(escrowSetup?.accountNumber),
      maskedAccountNumber: this.maskAccountNumber(escrowSetup?.accountNumber),
      ifscCode: escrowSetup?.ifscCode ?? null,
      branchDetails: escrowSetup?.branchDetails ?? null,
      currentBalance: this.normalizeAmount(totalCredits - totalDebits),
      totalCredits,
      totalDebits,
      currency: 'INR',
      status:
        escrowSetup?.isActive === false || escrowSetup?.isDeleted
          ? 'Inactive'
          : 'Active',
      recentTransactions: matchedTransactions.slice(0, 10).map(transaction => ({
        amount: this.toFiniteNumber(transaction.amount),
        direction: transaction.direction ?? null,
        transactionType: transaction.transactionType ?? null,
        createdAt: transaction.createdAt ?? null,
        referenceMovementId: transaction.referenceMovementId ?? null,
        status: transaction.status ?? null,
      })),
    };
  }

  private async findEscrowSetupForGroup(
    group: SpvApplicationGroup,
    currentPool: PoolFinancials | null,
  ): Promise<EscrowSetup | null> {
    const candidateApplicationIds = [
      currentPool?.spvApplicationId,
      ...group.applications
        .sort((left, right) => {
          const leftTime = new Date(left.createdAt ?? 0).getTime();
          const rightTime = new Date(right.createdAt ?? 0).getTime();
          return rightTime - leftTime;
        })
        .map(application => application.id),
    ].filter((value): value is string => Boolean(value));

    for (const applicationId of candidateApplicationIds) {
      const escrowSetup = await this.escrowSetupRepository.findOne({
        where: {
          and: [
            {spvApplicationId: applicationId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
        order: ['createdAt DESC'],
      });

      if (escrowSetup) {
        return escrowSetup;
      }
    }

    return null;
  }

  private async findSpvForApplication(
    application: SpvApplication,
  ): Promise<Spv | null> {
    const linkedSpvId = this.normalizeString(application.linkedSpvId);

    if (linkedSpvId && this.isUuid(linkedSpvId)) {
      const linkedSpv = await this.spvRepository.findOne({
        where: {
          and: [{id: linkedSpvId}, {isActive: true}, {isDeleted: false}],
        },
      });

      if (linkedSpv) {
        return linkedSpv;
      }
    }

    return this.spvRepository.findOne({
      where: {
        and: [
          {spvApplicationId: application.id},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      order: ['createdAt DESC'],
    });
  }

  private async findPoolsForGroup(
    group: SpvApplicationGroup,
  ): Promise<PoolFinancials[]> {
    const applicationIds = group.applications.map(application => application.id);
    const pools = await this.poolFinancialsRepository.find({
      where: {
        and: [
          {isActive: true},
          {isDeleted: false},
          {
            or: [
              {spvApplicationId: {inq: applicationIds}},
              ...(group.spv?.id ? [{spvId: group.spv.id}] : []),
            ],
          },
        ],
      },
      order: ['createdAt ASC'],
    });

    const uniquePools = new Map<string, PoolFinancials>();

    for (const pool of pools) {
      uniquePools.set(pool.id, pool);
    }

    return Array.from(uniquePools.values());
  }

  private pickCurrentPool(
    group: SpvApplicationGroup,
    pools: PoolFinancials[],
  ): PoolFinancials | null {
    const approvedApplicationIds = group.applications
      .filter(application => application.status === 1)
      .map(application => application.id);
    const sortedPools = [...pools].sort((left, right) => {
      const leftTime = new Date(left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.createdAt ?? 0).getTime();

      return rightTime - leftTime;
    });

    const currentApprovedPool = sortedPools.find(pool =>
      approvedApplicationIds.includes(pool.spvApplicationId),
    );

    return currentApprovedPool ?? sortedPools[0] ?? null;
  }

  private async findPtcsForSpv(spv: Spv | null): Promise<PtcIssuance[]> {
    if (!spv?.id) {
      return [];
    }

    return this.ptcIssuanceRepository.find({
      where: {
        and: [{spvId: spv.id}, {isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });
  }

  private filterAllocatedPtcs(ptcs: PtcIssuance[]): PtcIssuance[] {
    return ptcs.filter(
      ptc => String(ptc.status ?? '').trim().toUpperCase() === 'ALLOCATED',
    );
  }

  private async countActiveInvestors(
    spv: Spv | null,
    allocatedPtcs: PtcIssuance[],
  ): Promise<number> {
    if (!spv?.id || allocatedPtcs.length === 0) {
      return 0;
    }

    const holdings = await this.investorPtcHoldingRepository.find({
      where: {
        and: [
          {spvId: spv.id},
          {isActive: true},
          {isDeleted: false},
          {
            ptcIssuanceId: {
              inq: allocatedPtcs.map(ptc => ptc.id),
            },
          },
        ],
      },
      fields: {
        investorProfileId: true,
      },
    });

    return new Set(
      holdings
        .map(holding => String(holding.investorProfileId ?? '').trim())
        .filter(Boolean),
    ).size;
  }

  private sumAllocatedAum(ptcs: PtcIssuance[]): number {
    return this.normalizeAmount(
      ptcs.reduce(
        (sum, ptc) => sum + this.toFiniteNumber(ptc.investedAmount),
        0,
      ),
    );
  }

  private calculatePoolUtilizationPercent(
    poolFinancials: PoolFinancials | null,
  ): number {
    const poolLimit = this.toFiniteNumber(poolFinancials?.poolLimit);
    const outstanding = this.toFiniteNumber(poolFinancials?.outstanding);

    if (poolLimit <= 0) {
      return 0;
    }

    return this.normalizeAmount((outstanding / poolLimit) * 100);
  }

  private deriveMaturityDate(poolFinancials: PoolFinancials | null): Date | null {
    if (!poolFinancials?.createdAt) {
      return null;
    }

    const anchorDate = new Date(poolFinancials.createdAt);
    const maturityDays = Number(poolFinancials.maturityDays ?? 0);

    if (
      Number.isNaN(anchorDate.getTime()) ||
      Number.isNaN(maturityDays) ||
      maturityDays < 0
    ) {
      return null;
    }

    const maturityDate = new Date(anchorDate);
    maturityDate.setDate(maturityDate.getDate() + Math.trunc(maturityDays));

    return maturityDate;
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

  private normalizeString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private maskAccountNumber(accountNumber?: string | null): string | null {
    const normalized = String(accountNumber ?? '').trim();

    if (!normalized) {
      return null;
    }

    return `XXXX${normalized.slice(-4)}`;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private normalizeAmount(value: number): number {
    return Number(value.toFixed(2));
  }
}
