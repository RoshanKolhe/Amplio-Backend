import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {RedemptionPayout, RedemptionPayoutStatus} from '../models';
import {RedemptionPayoutRepository} from '../repositories';

export type CreateRedemptionPayoutPayload = {
  investorProfileId: string;
  spvId: string;
  transactionId: string;
  redemptionRequestId?: string;
  units: number;
  grossPayout: number;
  netPayout: number;
  principalPayout: number;
  interestPayout: number;
  capitalGain?: number;
  stampDutyAmount?: number;
  stampDutyRate?: number;
  annualInterestRate?: number;
  createdBy?: string;
  metadata?: object;
};

export type RedemptionPayoutListFilters = {
  spvId?: string;
  status?: string;
  investorProfileId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'processedAt' | 'netPayout';
  sortOrder?: 'ASC' | 'DESC';
};

export type RedemptionPayoutListResult = {
  data: RedemptionPayout[];
  total: number;
  limit: number;
  offset: number;
};

const TERMINAL_STATUSES: RedemptionPayoutStatus[] = [
  RedemptionPayoutStatus.TRANSFERRED,
  RedemptionPayoutStatus.FAILED,
];

export class RedemptionPayoutService {
  constructor(
    @repository(RedemptionPayoutRepository)
    private redemptionPayoutRepository: RedemptionPayoutRepository,
  ) {}

  async createRedemptionPayout(
    payload: CreateRedemptionPayoutPayload,
  ): Promise<RedemptionPayout> {
    return this.redemptionPayoutRepository.create({
      id: uuidv4(),
      investorProfileId: payload.investorProfileId,
      spvId: payload.spvId,
      transactionId: payload.transactionId,
      redemptionRequestId: payload.redemptionRequestId,
      units: payload.units,
      grossPayout: payload.grossPayout,
      netPayout: payload.netPayout,
      principalPayout: payload.principalPayout,
      interestPayout: payload.interestPayout,
      capitalGain: payload.capitalGain ?? 0,
      stampDutyAmount: payload.stampDutyAmount ?? 0,
      stampDutyRate: payload.stampDutyRate ?? 0,
      annualInterestRate: payload.annualInterestRate ?? 0,
      status: RedemptionPayoutStatus.PENDING,
      metadata: payload.metadata,
      createdBy: payload.createdBy,
      updatedBy: payload.createdBy,
      isActive: true,
      isDeleted: false,
    });
  }

  async listPayoutsForAdmin(
    filters: RedemptionPayoutListFilters = {},
  ): Promise<RedemptionPayoutListResult> {
    const where = {and: this.buildWhereFromFilters(filters)};
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;
    const sortField = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'DESC';

    const [data, countResult] = await Promise.all([
      this.redemptionPayoutRepository.find({
        where,
        order: [`${sortField} ${sortOrder}`],
        limit,
        skip: offset,
        include: ['investorProfile', 'spv'],
      }),
      this.redemptionPayoutRepository.count(where),
    ]);

    return {data, total: countResult.count, limit, offset};
  }

  async getPayoutById(payoutId: string): Promise<RedemptionPayout> {
    return this.redemptionPayoutRepository.findById(payoutId, {
      include: ['investorProfile', 'spv'],
    });
  }

  async markProcessing(
    payoutId: string,
    adminUserId: string,
  ): Promise<RedemptionPayout> {
    const payout = await this.redemptionPayoutRepository.findById(payoutId);

    if (payout.status !== RedemptionPayoutStatus.PENDING) {
      throw new HttpErrors.BadRequest(
        `Payout can only be moved to PROCESSING from PENDING. Current: '${payout.status}'`,
      );
    }

    await this.redemptionPayoutRepository.updateById(payoutId, {
      status: RedemptionPayoutStatus.PROCESSING,
      processedBy: adminUserId,
      processedAt: new Date(),
      updatedBy: adminUserId,
    });

    return this.redemptionPayoutRepository.findById(payoutId);
  }

  async updatePayoutStatus(
    payoutId: string,
    status: RedemptionPayoutStatus,
    adminUserId: string,
    options?: {
      transferReference?: string;
      failureReason?: string;
    },
  ): Promise<RedemptionPayout> {
    const payout = await this.redemptionPayoutRepository.findById(payoutId);

    if (TERMINAL_STATUSES.includes(payout.status)) {
      throw new HttpErrors.BadRequest(
        `Payout is already in terminal status '${payout.status}'`,
      );
    }

    const updatePayload: Partial<RedemptionPayout> = {
      status,
      processedBy: adminUserId,
      processedAt: new Date(),
      updatedBy: adminUserId,
    };

    if (options?.transferReference) {
      updatePayload.transferReference = options.transferReference;
    }

    if (options?.failureReason) {
      updatePayload.failureReason = options.failureReason;
    }

    await this.redemptionPayoutRepository.updateById(payoutId, updatePayload);

    return this.redemptionPayoutRepository.findById(payoutId);
  }

  private buildWhereFromFilters(filters: RedemptionPayoutListFilters): object[] {
    const where: object[] = [{isDeleted: false}];

    if (filters.spvId) where.push({spvId: filters.spvId});
    if (filters.status) where.push({status: filters.status});
    if (filters.investorProfileId) where.push({investorProfileId: filters.investorProfileId});

    if (filters.fromDate) {
      where.push({createdAt: {gte: new Date(filters.fromDate)}});
    }
    if (filters.toDate) {
      where.push({createdAt: {lte: new Date(filters.toDate)}});
    }

    return where;
  }
}
