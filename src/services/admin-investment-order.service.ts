import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {
  Escalation,
  EscalationStatus,
  InvestmentOrder,
  InvestmentOrderStatus,
  PoolFinancials,
  PtcFreezeStatus,
  SpvPaymentVerificationStatus,
} from '../models';
import {
  EscalationRepository,
  InvestmentOrderRepository,
  InvestorProfileRepository,
  PoolFinancialsRepository,
  PtcFreezeRepository,
  SpvPaymentVerificationRepository,
  UsersRepository,
} from '../repositories';

export type AdminOrderFilters = {
  spvId?: string;
  investorProfileId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
};

export type AdminOrderListItem = InvestmentOrder & {
  investorName?: string | null;
  investorEmail?: string | null;
};

export type AdminOrderListResult = {
  data: AdminOrderListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminOrderDetail = {
  order: InvestmentOrder;
  investorName: string | null;
  verificationStatus: SpvPaymentVerificationStatus | null;
  utrNumber: string | null;
  activeFreezeCount: number;
  freezeExpiresAt: Date | null;
};

export type AdminEscalationFilters = {
  spvId?: string;
  investorProfileId?: string;
  status?: string;
  escalationType?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
};

export type AdminEscalationListResult = {
  data: Escalation[];
  total: number;
  limit: number;
  offset: number;
};

export type OrderDashboardStats = {
  byStatus: Record<string, number>;
  totalOrders: number;
  escalations: {
    open: number;
    underReview: number;
    slaBreached: number;
  };
};

export class AdminInvestmentOrderService {
  constructor(
    @repository(InvestmentOrderRepository)
    private investmentOrderRepository: InvestmentOrderRepository,

    @repository(EscalationRepository)
    private escalationRepository: EscalationRepository,

    @repository(SpvPaymentVerificationRepository)
    private spvPaymentVerificationRepository: SpvPaymentVerificationRepository,

    @repository(PtcFreezeRepository)
    private ptcFreezeRepository: PtcFreezeRepository,

    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,

    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,

    @repository(UsersRepository)
    private usersRepository: UsersRepository,
  ) {}

  // ── Order monitoring ────────────────────────────────────────────────────────

  async listOrders(filters: AdminOrderFilters): Promise<AdminOrderListResult> {
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = filters.offset ?? 0;

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const andClauses: any[] = [{isDeleted: false}];

    if (filters.spvId) andClauses.push({spvId: filters.spvId});
    if (filters.investorProfileId)
      andClauses.push({investorProfileId: filters.investorProfileId});
    if (filters.status)
      andClauses.push({status: filters.status as InvestmentOrderStatus});
    if (filters.fromDate)
      andClauses.push({createdAt: {gte: new Date(filters.fromDate)}});
    if (filters.toDate)
      andClauses.push({createdAt: {lte: new Date(filters.toDate)}});

    const where = {and: andClauses};

    const [orders, total] = await Promise.all([
      this.investmentOrderRepository.find({
        where,
        limit,
        skip: offset,
        order: ['createdAt DESC'],
      }),
      this.investmentOrderRepository.count(where),
    ]);

    // Enrich with investor name and email via batch lookups
    const profileIds = [...new Set(orders.map((o) => o.investorProfileId).filter(Boolean))];
    const profileMap = new Map<string, {fullName?: string; usersId?: string}>();
    const userMap = new Map<string, string>();

    if (profileIds.length > 0) {
      const profiles = await this.investorProfileRepository.find({
        where: {id: {inq: profileIds}},
        fields: {id: true, fullName: true, usersId: true},
      });
      profiles.forEach((p) => profileMap.set(p.id, {fullName: p.fullName, usersId: p.usersId}));

      const userIds = [...new Set(profiles.map((p) => p.usersId).filter(Boolean))];
      if (userIds.length > 0) {
        const users = await this.usersRepository.find({
          where: {id: {inq: userIds}},
          fields: {id: true, email: true},
        });
        users.forEach((u) => userMap.set(u.id, u.email));
      }
    }

    const data: AdminOrderListItem[] = orders.map((order) => {
      const profile = profileMap.get(order.investorProfileId);
      const email = profile?.usersId ? userMap.get(profile.usersId) : undefined;
      return Object.assign(order, {
        investorName: profile?.fullName ?? null,
        investorEmail: email ?? null,
      });
    });

    return {data, total: total.count, limit, offset};
  }

  async getOrderDetail(orderId: string): Promise<AdminOrderDetail> {
    const order = await this.investmentOrderRepository.findById(orderId);

    // Investor name
    let investorName: string | null = null;
    try {
      const profile = await this.investorProfileRepository.findById(
        order.investorProfileId,
      );
      investorName = profile.fullName ?? null;
    } catch {
      // profile not critical
    }

    // Verification status
    let verificationStatus: SpvPaymentVerificationStatus | null = null;
    let utrNumber: string | null = null;
    let freezeExpiresAt: Date | null = null;

    if (order.verificationId) {
      try {
        const v = await this.spvPaymentVerificationRepository.findById(
          order.verificationId,
        );
        verificationStatus = v.status;
        utrNumber = v.utrNumber ?? null;
        freezeExpiresAt = v.freezeExpiresAt ? new Date(v.freezeExpiresAt) : null;
      } catch {
        // verification may be deleted
      }
    }

    // Active freeze count
    const freezeCount = await this.ptcFreezeRepository.count({
      orderId,
      status: PtcFreezeStatus.ACTIVE,
    });

    return {
      order,
      investorName,
      verificationStatus,
      utrNumber,
      activeFreezeCount: freezeCount.count,
      freezeExpiresAt,
    };
  }

  async forceExpireOrder(
    orderId: string,
    adminId: string,
    reason?: string,
  ): Promise<InvestmentOrder> {
    const order = await this.investmentOrderRepository.findById(orderId);

    const expirableStatuses: InvestmentOrderStatus[] = [
      InvestmentOrderStatus.CREATED,
      InvestmentOrderStatus.AGREEMENT_SIGNED,
      InvestmentOrderStatus.PAYMENT_PENDING,
      InvestmentOrderStatus.UTR_SUBMITTED,
      InvestmentOrderStatus.PAYMENT_UNDER_REVIEW,
    ];

    if (!expirableStatuses.includes(order.status)) {
      throw new HttpErrors.BadRequest(
        `Cannot force-expire order in status ${order.status}.`,
      );
    }

    // Expire linked verification if still active
    if (order.verificationId) {
      try {
        const v = await this.spvPaymentVerificationRepository.findById(
          order.verificationId,
        );
        const expirableVerifStatuses: SpvPaymentVerificationStatus[] = [
          SpvPaymentVerificationStatus.PENDING,
          SpvPaymentVerificationStatus.SUBMITTED,
        ];
        if (expirableVerifStatuses.includes(v.status)) {
          await this.spvPaymentVerificationRepository.updateById(
            order.verificationId,
            {
              status: SpvPaymentVerificationStatus.EXPIRED,
              reservationStatus: 'RELEASED',
              updatedBy: adminId,
            },
          );
        }
      } catch {
        // non-critical
      }
    }

    // Release any active PTC freezes
    const activeFreezes = await this.ptcFreezeRepository.find({
      where: {orderId, status: PtcFreezeStatus.ACTIVE},
    });
    await Promise.all(
      activeFreezes.map(f =>
        this.ptcFreezeRepository.updateById(f.id, {
          status: PtcFreezeStatus.RELEASED,
          releasedAt: new Date(),
          releaseReason: 'CANCELLED',
          updatedBy: adminId,
        }),
      ),
    );

    await this.investmentOrderRepository.updateById(orderId, {
      status: InvestmentOrderStatus.PAYMENT_TIMEOUT,
      resolvedAt: new Date(),
      isActive: false,
      cancellationReason: reason ?? 'Force-expired by admin',
      updatedBy: adminId,
    });

    return this.investmentOrderRepository.findById(orderId);
  }

  async getDashboardStats(spvId?: string): Promise<OrderDashboardStats> {
    const baseWhere = spvId
      ? {and: [{isDeleted: false}, {spvId}]}
      : {isDeleted: false};

    // Count orders per status in parallel
    const statuses = Object.values(InvestmentOrderStatus);
    const statusCounts = await Promise.all(
      statuses.map(s =>
        this.investmentOrderRepository
          .count({...baseWhere, status: s} as object)
          .then(r => ({status: s, count: r.count})),
      ),
    );

    const byStatus: Record<string, number> = {};
    let totalOrders = 0;
    for (const {status, count} of statusCounts) {
      byStatus[status] = count;
      totalOrders += count;
    }

    // Escalation stats
    const now = new Date();
    const escalationBaseWhere = spvId ? {spvId} : {};

    const [openCount, underReviewCount, allActive] = await Promise.all([
      this.escalationRepository.count({
        ...escalationBaseWhere,
        status: EscalationStatus.OPEN,
      }),
      this.escalationRepository.count({
        ...escalationBaseWhere,
        status: EscalationStatus.UNDER_REVIEW,
      }),
      this.escalationRepository.find({
        where: {
          and: [
            escalationBaseWhere,
            {status: {inq: [EscalationStatus.OPEN, EscalationStatus.UNDER_REVIEW]}},
            {slaDeadlineAt: {lte: now}},
          ],
        },
        fields: {id: true},
      }),
    ]);

    return {
      byStatus,
      totalOrders,
      escalations: {
        open: openCount.count,
        underReview: underReviewCount.count,
        slaBreached: allActive.length,
      },
    };
  }

  // ── Escalation management ───────────────────────────────────────────────────

  async listEscalations(
    filters: AdminEscalationFilters,
  ): Promise<AdminEscalationListResult> {
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = filters.offset ?? 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const andClauses: any[] = [];

    if (filters.spvId) andClauses.push({spvId: filters.spvId});
    if (filters.investorProfileId)
      andClauses.push({investorProfileId: filters.investorProfileId});
    if (filters.status)
      andClauses.push({status: filters.status as EscalationStatus});
    if (filters.escalationType)
      andClauses.push({escalationType: filters.escalationType});
    if (filters.fromDate)
      andClauses.push({createdAt: {gte: new Date(filters.fromDate)}});
    if (filters.toDate)
      andClauses.push({createdAt: {lte: new Date(filters.toDate)}});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = andClauses.length > 0 ? {and: andClauses} : {};

    const [data, total] = await Promise.all([
      this.escalationRepository.find({
        where,
        limit,
        skip: offset,
        order: ['createdAt DESC'],
      }),
      this.escalationRepository.count(where),
    ]);

    return {data, total: total.count, limit, offset};
  }

  async getEscalationDetail(escalationId: string): Promise<Escalation> {
    return this.escalationRepository.findById(escalationId);
  }

  async updateEscalationStatus(
    escalationId: string,
    status: EscalationStatus,
    adminId: string,
    resolution?: string,
  ): Promise<Escalation> {
    const escalation = await this.escalationRepository.findById(escalationId);

    const terminalStatuses = [EscalationStatus.RESOLVED, EscalationStatus.CLOSED];
    if (terminalStatuses.includes(escalation.status)) {
      throw new HttpErrors.BadRequest(
        `Escalation is already ${escalation.status} and cannot be updated.`,
      );
    }

    const update: Partial<Escalation> = {
      status,
      updatedBy: adminId,
    };

    if (
      status === EscalationStatus.RESOLVED ||
      status === EscalationStatus.CLOSED
    ) {
      if (!resolution) {
        throw new HttpErrors.BadRequest(
          'Resolution is required when closing or resolving an escalation.',
        );
      }
      update.resolution = resolution;
      update.resolvedBy = adminId;
      update.resolvedAt = new Date();
    }

    await this.escalationRepository.updateById(escalationId, update);
    return this.escalationRepository.findById(escalationId);
  }

  // ── Pool cutoff settings ────────────────────────────────────────────────────

  async getPoolCutoffSettings(spvId: string): Promise<Partial<PoolFinancials>> {
    const pool = await this.poolFinancialsRepository.findOne({
      where: {spvId, isActive: true, isDeleted: false},
    });
    if (!pool) {
      throw new HttpErrors.NotFound(`No active pool financials found for SPV ${spvId}`);
    }
    return {
      id: pool.id,
      spvId: pool.spvId,
      enforceCutoffWindow: pool.enforceCutoffWindow ?? false,
      morningCutoffTime: pool.morningCutoffTime ?? '09:00:00',
      eveningCutoffTime: pool.eveningCutoffTime ?? '15:00:00',
    };
  }

  async updatePoolCutoffSettings(
    spvId: string,
    settings: {
      enforceCutoffWindow?: boolean;
      morningCutoffTime?: string;
      eveningCutoffTime?: string;
    },
    adminId: string,
  ): Promise<Partial<PoolFinancials>> {
    const pool = await this.poolFinancialsRepository.findOne({
      where: {spvId, isActive: true, isDeleted: false},
    });
    if (!pool) {
      throw new HttpErrors.NotFound(`No active pool financials found for SPV ${spvId}`);
    }

    // Validate time format HH:MM or HH:MM:SS
    const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
    if (settings.morningCutoffTime && !timeRe.test(settings.morningCutoffTime)) {
      throw new HttpErrors.BadRequest('morningCutoffTime must be in HH:MM or HH:MM:SS format');
    }
    if (settings.eveningCutoffTime && !timeRe.test(settings.eveningCutoffTime)) {
      throw new HttpErrors.BadRequest('eveningCutoffTime must be in HH:MM or HH:MM:SS format');
    }

    const patch: Partial<PoolFinancials> = {};
    if (settings.enforceCutoffWindow !== undefined) patch.enforceCutoffWindow = settings.enforceCutoffWindow;
    if (settings.morningCutoffTime) patch.morningCutoffTime = settings.morningCutoffTime;
    if (settings.eveningCutoffTime) patch.eveningCutoffTime = settings.eveningCutoffTime;

    await this.poolFinancialsRepository.updateById(pool.id, patch);
    return this.getPoolCutoffSettings(spvId);
  }
}
