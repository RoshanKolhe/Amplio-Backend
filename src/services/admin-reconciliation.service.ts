import {repository} from '@loopback/repository';
import {
  RedemptionPayoutStatus,
  SpvPaymentVerification,
  SpvPaymentVerificationStatus,
} from '../models';
import {
  RedemptionPayoutRepository,
  SpvPaymentVerificationRepository,
} from '../repositories';

// Verifications stuck in SUBMITTED for more than this many minutes are "unmatched"
const UNMATCHED_UTR_THRESHOLD_MINUTES = 60;

// Verifications stuck in VERIFIED/AUTO_VERIFIED for more than this are "allocation failed"
const ALLOCATION_STUCK_THRESHOLD_MINUTES = 30;

// PENDING verifications older than this are considered expired
const EXPIRED_INTENT_HOURS = 48;

export type ReconciliationSummary = {
  pendingVerifications: number;
  submittedVerifications: number;
  verifiedPendingAllocation: number;
  allocatedVerifications: number;
  rejectedVerifications: number;
  suspiciousVerifications: number;
  expiredPaymentIntents: number;
  unmatchedUtrs: number;
  stuckAllocations: number;
  duplicateUtrGroups: number;
  utrConflicts: number;
  amountVarianceFlags: number;
  pendingPayouts: number;
  processingPayouts: number;
  failedPayouts: number;
  transferredPayouts: number;
};

export type DuplicateUtrGroup = {
  utrNumber: string;
  count: number;
  verifications: SpvPaymentVerification[];
};

export type AllocationMonitoringItem = {
  verificationId: string;
  investorProfileId: string;
  spvId: string;
  amount: number;
  units: number;
  status: SpvPaymentVerificationStatus;
  verifiedAt: Date | null;
  minutesSinceVerified: number;
  verifiedBy: string | null;
};

export class AdminReconciliationService {
  constructor(
    @repository(SpvPaymentVerificationRepository)
    private verificationRepository: SpvPaymentVerificationRepository,
    @repository(RedemptionPayoutRepository)
    private redemptionPayoutRepository: RedemptionPayoutRepository,
  ) {}

  async getReconciliationSummary(): Promise<ReconciliationSummary> {
    const [
      pending,
      submitted,
      verified,
      autoVerified,
      allocated,
      rejected,
      suspicious,
      pendingPayouts,
      processingPayouts,
      failedPayouts,
      transferredPayouts,
      unmatchedUtrs,
      stuckAllocations,
      duplicateUtrGroups,
      expiredIntents,
      utrConflicts,
      amountVarianceFlags,
    ] = await Promise.all([
      this.countByStatus(SpvPaymentVerificationStatus.PENDING),
      this.countByStatus(SpvPaymentVerificationStatus.SUBMITTED),
      this.countByStatus(SpvPaymentVerificationStatus.VERIFIED),
      this.countByStatus(SpvPaymentVerificationStatus.AUTO_VERIFIED),
      this.countByStatus(SpvPaymentVerificationStatus.ALLOCATED),
      this.countByStatus(SpvPaymentVerificationStatus.REJECTED),
      this.countByStatus(SpvPaymentVerificationStatus.SUSPICIOUS),
      this.redemptionPayoutRepository.count({
        and: [{status: RedemptionPayoutStatus.PENDING}, {isDeleted: false}],
      }),
      this.redemptionPayoutRepository.count({
        and: [{status: RedemptionPayoutStatus.PROCESSING}, {isDeleted: false}],
      }),
      this.redemptionPayoutRepository.count({
        and: [{status: RedemptionPayoutStatus.FAILED}, {isDeleted: false}],
      }),
      this.redemptionPayoutRepository.count({
        and: [{status: RedemptionPayoutStatus.TRANSFERRED}, {isDeleted: false}],
      }),
      this.getUnmatchedUtrs().then(r => r.length),
      this.getStuckAllocations().then(r => r.length),
      this.getDuplicateUtrGroups().then(r => r.length),
      this.getExpiredPaymentIntents().then(r => r.length),
      this.getUtrConflicts().then(r => r.length),
      this.getAmountVarianceFlags().then(r => r.length),
    ]);

    return {
      pendingVerifications: pending.count,
      submittedVerifications: submitted.count,
      verifiedPendingAllocation: verified.count + autoVerified.count,
      allocatedVerifications: allocated.count,
      rejectedVerifications: rejected.count,
      suspiciousVerifications: suspicious.count,
      expiredPaymentIntents: expiredIntents,
      utrConflicts,
      amountVarianceFlags,
      unmatchedUtrs,
      stuckAllocations,
      duplicateUtrGroups,
      pendingPayouts: pendingPayouts.count,
      processingPayouts: processingPayouts.count,
      failedPayouts: failedPayouts.count,
      transferredPayouts: transferredPayouts.count,
    };
  }

  async getUnmatchedUtrs(): Promise<SpvPaymentVerification[]> {
    const thresholdTime = new Date(
      Date.now() - UNMATCHED_UTR_THRESHOLD_MINUTES * 60 * 1000,
    );

    return this.verificationRepository.find({
      where: {
        and: [
          {status: SpvPaymentVerificationStatus.SUBMITTED},
          {isDeleted: false},
          {updatedAt: {lte: thresholdTime}},
        ],
      },
      order: ['updatedAt ASC'],
      limit: 200,
    });
  }

  async getStuckAllocations(): Promise<AllocationMonitoringItem[]> {
    const thresholdTime = new Date(
      Date.now() - ALLOCATION_STUCK_THRESHOLD_MINUTES * 60 * 1000,
    );
    const now = Date.now();

    const stuck = await this.verificationRepository.find({
      where: {
        and: [
          {
            or: [
              {status: SpvPaymentVerificationStatus.VERIFIED},
              {status: SpvPaymentVerificationStatus.AUTO_VERIFIED},
            ],
          },
          {isDeleted: false},
          {verifiedAt: {lte: thresholdTime}},
        ],
      },
      order: ['verifiedAt ASC'],
      limit: 200,
    });

    return stuck.map(v => ({
      verificationId: v.id,
      investorProfileId: v.investorProfileId,
      spvId: v.spvId,
      amount: v.amount,
      units: v.units,
      status: v.status,
      verifiedAt: v.verifiedAt ?? null,
      minutesSinceVerified: v.verifiedAt
        ? Math.floor((now - new Date(v.verifiedAt).getTime()) / 60000)
        : 0,
      verifiedBy: v.verifiedBy ?? null,
    }));
  }

  async getAllVerificationsForAllocationMonitoring(): Promise<AllocationMonitoringItem[]> {
    const now = Date.now();

    const verifications = await this.verificationRepository.find({
      where: {
        and: [
          {
            or: [
              {status: SpvPaymentVerificationStatus.VERIFIED},
              {status: SpvPaymentVerificationStatus.AUTO_VERIFIED},
            ],
          },
          {isDeleted: false},
        ],
      },
      order: ['verifiedAt ASC'],
      limit: 500,
    });

    return verifications.map(v => ({
      verificationId: v.id,
      investorProfileId: v.investorProfileId,
      spvId: v.spvId,
      amount: v.amount,
      units: v.units,
      status: v.status,
      verifiedAt: v.verifiedAt ?? null,
      minutesSinceVerified: v.verifiedAt
        ? Math.floor((now - new Date(v.verifiedAt).getTime()) / 60000)
        : 0,
      verifiedBy: v.verifiedBy ?? null,
    }));
  }

  async getDuplicateUtrGroups(): Promise<DuplicateUtrGroup[]> {
    const all = await this.verificationRepository.find({
      where: {and: [{isDeleted: false}]},
      order: ['utrNumber ASC', 'createdAt ASC'],
    });
    const verifications = all.filter(v => !!v.utrNumber);

    const grouped = new Map<string, SpvPaymentVerification[]>();
    for (const v of verifications) {
      if (!v.utrNumber) continue;
      const existing = grouped.get(v.utrNumber) ?? [];
      existing.push(v);
      grouped.set(v.utrNumber, existing);
    }

    const duplicates: DuplicateUtrGroup[] = [];
    for (const [utrNumber, items] of grouped.entries()) {
      if (items.length > 1) {
        duplicates.push({utrNumber, count: items.length, verifications: items});
      }
    }

    return duplicates.sort((a, b) => b.count - a.count);
  }

  async getRejectedVerifications(limit = 100): Promise<SpvPaymentVerification[]> {
    return this.verificationRepository.find({
      where: {
        and: [
          {status: SpvPaymentVerificationStatus.REJECTED},
          {isDeleted: false},
        ],
      },
      order: ['updatedAt DESC'],
      limit,
    });
  }

  async getSuspiciousVerifications(limit = 100): Promise<SpvPaymentVerification[]> {
    return this.verificationRepository.find({
      where: {
        and: [
          {status: SpvPaymentVerificationStatus.SUSPICIOUS},
          {isDeleted: false},
        ],
      },
      order: ['updatedAt DESC'],
      limit,
    });
  }

  async getFailedPayouts(limit = 100) {
    return this.redemptionPayoutRepository.find({
      where: {
        and: [
          {status: RedemptionPayoutStatus.FAILED},
          {isDeleted: false},
        ],
      },
      order: ['updatedAt DESC'],
      limit,
    });
  }

  async getExpiredPaymentIntents(): Promise<SpvPaymentVerification[]> {
    const cutoff = new Date(
      Date.now() - EXPIRED_INTENT_HOURS * 60 * 60 * 1000,
    );

    return this.verificationRepository.find({
      where: {
        and: [
          {status: SpvPaymentVerificationStatus.PENDING},
          {isDeleted: false},
          {createdAt: {lte: cutoff}},
        ],
      },
      order: ['createdAt ASC'],
      limit: 200,
    });
  }

  async getUtrConflicts(): Promise<SpvPaymentVerification[]> {
    const all = await this.verificationRepository.find({
      where: {and: [{isDeleted: false}]},
    });

    return all.filter(v => {
      const meta = v.metadata as Record<string, unknown> | undefined;
      return !!meta?.utrConflict;
    });
  }

  async getAmountVarianceFlags(): Promise<SpvPaymentVerification[]> {
    const all = await this.verificationRepository.find({
      where: {
        and: [
          {isDeleted: false},
          {
            or: [
              {status: SpvPaymentVerificationStatus.VERIFIED},
              {status: SpvPaymentVerificationStatus.AUTO_VERIFIED},
              {status: SpvPaymentVerificationStatus.ALLOCATED},
            ],
          },
        ],
      },
    });

    return all.filter(v => {
      const meta = v.metadata as Record<string, unknown> | undefined;
      return !!meta?.amountVariance;
    });
  }

  private countByStatus(status: SpvPaymentVerificationStatus) {
    return this.verificationRepository.count({
      and: [{status}, {isDeleted: false}],
    });
  }
}
