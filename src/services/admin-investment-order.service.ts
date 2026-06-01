import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {
  CustomerSupport,
  CustomerSupportWithRelations,
  Escalation,
  EscalationStatus,
  InvestmentOrder,
  InvestmentOrderStatus,
  PoolFinancials,
  PtcFreezeStatus,
  SpvPaymentVerificationStatus,
} from '../models';
import {
  CustomerSupportRepository,
  EscalationRepository,
  InvestmentOrderRepository,
  InvestorProfileRepository,
  PoolFinancialsRepository,
  PtcFreezeRepository,
  SpvPaymentVerificationRepository,
  SpvRepository,
  UsersRepository,
} from '../repositories';
import {PtcIssuanceService, UnitReservation} from './ptc-issuance.service';

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
  investorProfile?: {
    id: string;
    fullName?: string | null;
    companyName?: string | null;
    usersId?: string | null;
  } | null;
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

export type AdminCustomerSupportListItem = CustomerSupport & {
  investorName?: string | null;
  investorId?: string;
  transactionId?: string | null;
  amount?: number;
  units?: number;
  shortDescription?: string;
  description?: string;
  spvId?: string;
  spvName?: string | null;
};

export type AdminCustomerSupportListResult = {
  data: AdminCustomerSupportListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminRejectedOrderListItem = InvestmentOrder & {
  orderId: string;
  investorName?: string | null;
  investorId?: string;
  spvName?: string | null;
  amount?: number;
  rejectedReason?: string | null;
  rejectedAt?: Date | null;
};

export type AdminRejectedOrderListResult = {
  data: AdminRejectedOrderListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type UpdateAdminCustomerSupportDto = {
  status?: CustomerSupport['status'];
  adminResponse?: string;
  assignSuperAdmin?: boolean;
};

export class AdminInvestmentOrderService {
  constructor(
    @repository(InvestmentOrderRepository)
    private investmentOrderRepository: InvestmentOrderRepository,

    @repository(EscalationRepository)
    private escalationRepository: EscalationRepository,

    @repository(CustomerSupportRepository)
    private customerSupportRepository: CustomerSupportRepository,

    @repository(SpvPaymentVerificationRepository)
    private spvPaymentVerificationRepository: SpvPaymentVerificationRepository,

    @repository(PtcFreezeRepository)
    private ptcFreezeRepository: PtcFreezeRepository,

    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,

    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,

    @repository(SpvRepository)
    private spvRepository: SpvRepository,

    @repository(UsersRepository)
    private usersRepository: UsersRepository,

    @inject('service.ptcIssuance.service')
    private ptcIssuanceService: PtcIssuanceService,
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
    const profileMap = new Map<
      string,
      {id: string; fullName?: string; companyName?: string; usersId?: string}
    >();
    const userMap = new Map<string, string>();

    if (profileIds.length > 0) {
      const profiles = await this.investorProfileRepository.find({
        where: {id: {inq: profileIds}},
        fields: {id: true, fullName: true, companyName: true, usersId: true},
      });
      profiles.forEach((p) =>
        profileMap.set(p.id, {
          id: p.id,
          fullName: p.fullName,
          companyName: p.companyName,
          usersId: p.usersId,
        }),
      );

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
        investorName: profile?.companyName ?? profile?.fullName ?? email ?? null,
        investorEmail: email ?? null,
        investorProfile: profile
          ? {
              id: profile.id,
              fullName: profile.fullName ?? null,
              companyName: profile.companyName ?? null,
              usersId: profile.usersId ?? null,
            }
          : null,
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
          // Release the inventory reservation before expiring, so units flow back
          // to remainingUnits in ptc_issuances.  Without this the units stay locked
          // even though no allocation will ever occur.
          if (v.reservationStatus === 'RESERVED') {
            try {
              const meta = (v.metadata ?? {}) as {reservation?: UnitReservation[]};
              const reservations = meta.reservation ?? [];
              if (reservations.length > 0) {
                await this.ptcIssuanceService.releaseUnitsReservation(
                  reservations,
                  `force-expired by admin ${adminId}`,
                );
              }
            } catch (releaseErr) {
              console.error(
                `[AdminInvestmentOrderService] Failed to release reservation for verification ${order.verificationId}:`,
                releaseErr,
              );
            }
          }

          await this.spvPaymentVerificationRepository.updateById(
            order.verificationId,
            {
              status: SpvPaymentVerificationStatus.EXPIRED,
              reservationStatus: v.reservationStatus === 'RESERVED' ? 'RELEASED' : v.reservationStatus,
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

  async listRejectedOrders(
    filters: {spvId?: string; limit?: number; offset?: number},
  ): Promise<AdminRejectedOrderListResult> {
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = filters.offset ?? 0;

    const where = {
      and: [
        {isDeleted: false},
        {status: InvestmentOrderStatus.CANCELLED},
        ...(filters.spvId ? [{spvId: filters.spvId}] : []),
      ],
    };

    const [orders, total] = await Promise.all([
      this.investmentOrderRepository.find({
        where,
        include: [{relation: 'investorProfile'}],
        limit,
        skip: offset,
        order: ['updatedAt DESC'],
      }),
      this.investmentOrderRepository.count(where),
    ]);

    const spvIds = [...new Set(orders.map(order => order.spvId).filter(Boolean))];

    const spvs =
      spvIds.length > 0
        ? await this.spvRepository.find({
            where: {id: {inq: spvIds}},
            fields: {id: true, spvName: true},
          })
        : [];

    const spvMap = new Map(spvs.map(spv => [spv.id, spv]));

    const data: AdminRejectedOrderListItem[] = orders.map(order => {
      const profile = (order as InvestmentOrder & {investorProfile?: {fullName?: string; companyName?: string}}).investorProfile;
      const spv = spvMap.get(order.spvId);

      return Object.assign(order, {
        orderId: order.id,
        investorName: profile?.companyName ?? profile?.fullName ?? null,
        investorId: order.investorProfileId,
        spvName: spv?.spvName ?? null,
        amount: order.investmentAmount ? Number(order.investmentAmount) : 0,
        rejectedReason: order.cancellationReason ?? null,
        rejectedAt: order.resolvedAt ?? order.updatedAt ?? null,
      });
    });

    return {data, total: total.count, limit, offset};
  }

  async listCustomerSupport(
    filters: {spvId?: string; limit?: number; offset?: number},
  ): Promise<AdminCustomerSupportListResult> {
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = filters.offset ?? 0;

    const orderWhere = filters.spvId
      ? {spvId: filters.spvId, isDeleted: false}
      : {isDeleted: false};

    const orders = await this.investmentOrderRepository.find({
      where: orderWhere,
      fields: {
        id: true,
        investorProfileId: true,
        spvId: true,
        transactionId: true,
        investmentAmount: true,
        requestedUnits: true,
      },
    });

    if (orders.length === 0) {
      return {data: [], total: 0, limit, offset};
    }

    const orderIds = orders.map(order => order.id);
    const orderMap = new Map(orders.map(order => [order.id, order]));
    const supportWhere = {orderId: {inq: orderIds}};

    const [supports, total] = await Promise.all([
      this.customerSupportRepository.find({
        where: supportWhere,
        include: [
          {relation: 'order'},
          {relation: 'investorProfile'},
          {relation: 'attachmentMedia'},
        ],
        limit,
        skip: offset,
        order: ['createdAt DESC'],
      }),
      this.customerSupportRepository.count(supportWhere),
    ]);

    const investorProfileIds = [
      ...new Set(supports.map(item => item.investorProfileId).filter(Boolean)),
    ];
    const spvIds = [
      ...new Set(
        supports
          .map(item => orderMap.get(item.orderId)?.spvId)
          .filter(Boolean),
      ),
    ] as string[];

    const [profiles, spvs] = await Promise.all([
      investorProfileIds.length > 0
        ? this.investorProfileRepository.find({
            where: {id: {inq: investorProfileIds}},
            fields: {id: true, fullName: true},
          })
        : Promise.resolve([]),
      spvIds.length > 0
        ? this.spvRepository.find({
            where: {id: {inq: spvIds}},
            fields: {id: true, spvName: true},
          })
        : Promise.resolve([]),
    ]);

    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const spvMap = new Map(spvs.map(spv => [spv.id, spv]));

    const data: AdminCustomerSupportListItem[] = (
      supports as CustomerSupportWithRelations[]
    ).map(item => {
      const order = item.order ?? orderMap.get(item.orderId);
      const profile = item.investorProfile ?? profileMap.get(item.investorProfileId);
      const spv = order?.spvId ? spvMap.get(order.spvId) : undefined;

      return Object.assign(item, {
        investorName: profile?.fullName ?? null,
        investorId: item.investorProfileId,
        transactionId: order?.transactionId ?? null,
        amount: order?.investmentAmount ? Number(order.investmentAmount) : 0,
        units: order?.requestedUnits ?? 0,
        shortDescription: item.issueType,
        description: item.complaintDescription,
        spvId: order?.spvId,
        spvName: spv?.spvName ?? null,
      });
    });

    return {data, total: total.count, limit, offset};
  }

  async updateCustomerSupport(
    supportId: string,
    adminId: string,
    payload: UpdateAdminCustomerSupportDto,
  ): Promise<CustomerSupportWithRelations> {
    const support = await this.customerSupportRepository.findById(supportId);

    if (!payload.status && payload.adminResponse === undefined && !payload.assignSuperAdmin) {
      throw new HttpErrors.BadRequest(
        'At least one of status, adminResponse, or assignSuperAdmin is required.',
      );
    }

    const update: Partial<CustomerSupport> = {
      updatedBy: adminId,
    };

    if (payload.status) {
      update.status = payload.status;
    }

    if (payload.adminResponse !== undefined) {
      update.adminResponse = payload.adminResponse.trim();
    }

    if (payload.assignSuperAdmin) {
      update.superAdminId = adminId;
    }

    await this.customerSupportRepository.updateById(support.id, update);

    return this.customerSupportRepository.findById(support.id, {
      include: [
        {relation: 'order'},
        {relation: 'investorProfile'},
        {relation: 'attachmentMedia'},
        {relation: 'superAdmin'},
      ],
    });
  }

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
