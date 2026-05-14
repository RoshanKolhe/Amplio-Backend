/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {BankDetails, RedemptionPayout, RedemptionPayoutStatus} from '../models';
import {BankDetailsRepository, RedemptionPayoutRepository} from '../repositories';

// ── IST constants ─────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+5:30
const PAYOUT_CUTOFF_HOUR_IST = 17;     // 5 PM IST
const MAX_RETRY_ATTEMPTS = 3;
const STALE_PROCESSING_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

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

export type ScheduleRedemptionPayoutPayload = CreateRedemptionPayoutPayload & {
  submittedAt: Date;
  bankAccountId: string;
  bankAccountSnapshot: object;
  idempotencyKey?: string;
};

export type SettlementSchedule = {
  expectedPayoutDate: Date;
  submittedAfterCutoff: boolean;
  extraInterestDays: number;
};

export type RedemptionPayoutListFilters = {
  spvId?: string;
  status?: string;
  investorProfileId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'processedAt' | 'netPayout' | 'expectedPayoutDate';
  sortOrder?: 'ASC' | 'DESC';
};

export type RedemptionPayoutListResult = {
  data: RedemptionPayout[];
  total: number;
  limit: number;
  offset: number;
};

const TERMINAL_STATUSES: RedemptionPayoutStatus[] = [
  RedemptionPayoutStatus.PAID,
  RedemptionPayoutStatus.RECONCILED,
  RedemptionPayoutStatus.FAILED,
  RedemptionPayoutStatus.CANCELLED,
  RedemptionPayoutStatus.TRANSFERRED, // legacy
];

// ─────────────────────────────────────────────────────────────────────────────

export class RedemptionPayoutService {
  constructor(
    @repository(RedemptionPayoutRepository)
    private redemptionPayoutRepository: RedemptionPayoutRepository,

    @repository(BankDetailsRepository)
    private bankDetailsRepository: BankDetailsRepository,
  ) {}

  // ── Settlement scheduling ─────────────────────────────────────────────────

  /**
   * Calculates the expected payout date and interest eligibility based on the
   * 5 PM IST cutoff rule:
   *   - Before 5 PM IST → payout next business day, investor earns 1 extra interest day
   *   - At/After 5 PM IST → payout business day after next, no extra interest
   */
  calculateSettlementSchedule(submittedAt: Date): SettlementSchedule {
    // Shift to IST — the resulting UTC components ARE the IST calendar components.
    const istDate = new Date(submittedAt.getTime() + IST_OFFSET_MS);
    const istHour = istDate.getUTCHours();
    const submittedAfterCutoff = istHour >= PAYOUT_CUTOFF_HOUR_IST;
    const extraInterestDays = submittedAfterCutoff ? 0 : 1;

    // Build the IST calendar date as a UTC midnight using Date.UTC so no offset subtraction
    // happens. The old approach subtracted IST_OFFSET_MS before truncating, which rolled
    // the timestamp back across the date boundary and produced T+0 payouts instead of T+1.
    const todayIst = new Date(Date.UTC(
      istDate.getUTCFullYear(),
      istDate.getUTCMonth(),
      istDate.getUTCDate(),
    ));

    // T+1 for before cutoff, T+2 for after cutoff
    const settlementDayOffset = submittedAfterCutoff ? 2 : 1;
    const candidate = new Date(todayIst.getTime() + settlementDayOffset * 86400000);

    // Advance past any weekends
    const expectedPayoutDate = this.nextBusinessDayFrom(candidate);

    return {expectedPayoutDate, submittedAfterCutoff, extraInterestDays};
  }

  /** Advances a date (IST pseudo-date) until it falls on a Mon–Fri. */
  private nextBusinessDayFrom(istDate: Date): Date {
    const d = new Date(istDate);
    const day = d.getUTCDay(); // 0=Sun, 6=Sat in pseudo-IST
    if (day === 0) d.setUTCDate(d.getUTCDate() + 1); // Sunday → Monday
    if (day === 6) d.setUTCDate(d.getUTCDate() + 2); // Saturday → Monday
    return d;
  }

  // ── Bank account validation ───────────────────────────────────────────────

  /**
   * Returns the investor's active, verified, primary bank account.
   * Throws 422 if none exists — payout cannot proceed without one.
   */
  async getPrimaryVerifiedBankAccount(investorUsersId: string): Promise<BankDetails> {
    const account = await this.bankDetailsRepository.findOne({
      where: {
        and: [
          {usersId: investorUsersId},
          {isPrimary: true},
          {status: 1},      // 1 = approved
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!account) {
      throw new HttpErrors.UnprocessableEntity(
        'No verified primary bank account found. Please add and verify a bank account before withdrawing.',
      );
    }

    return account;
  }

  // ── Payout record creation ────────────────────────────────────────────────

  /**
   * Creates a scheduled redemption payout record. Units have already been deducted
   * from holdings before this is called. This call must be idempotent — the
   * idempotency key prevents duplicate records if the caller retries.
   */
  async scheduleRedemptionPayout(
    payload: ScheduleRedemptionPayoutPayload,
  ): Promise<RedemptionPayout> {
    const schedule = this.calculateSettlementSchedule(payload.submittedAt);
    const idempotencyKey =
      payload.idempotencyKey ??
      `${payload.investorProfileId}:${payload.spvId}:${payload.transactionId}`;

    // Idempotency guard: return existing record if already created
    const existing = await this.redemptionPayoutRepository.findOne({
      where: {idempotencyKey, isDeleted: false},
    });
    if (existing) return existing;

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
      status: RedemptionPayoutStatus.REQUESTED,
      submittedAt: payload.submittedAt,
      submittedAfterCutoff: schedule.submittedAfterCutoff,
      extraInterestDays: schedule.extraInterestDays,
      expectedPayoutDate: schedule.expectedPayoutDate,
      bankAccountId: payload.bankAccountId,
      bankAccountSnapshot: payload.bankAccountSnapshot,
      idempotencyKey,
      retryCount: 0,
      metadata: payload.metadata,
      createdBy: payload.createdBy,
      updatedBy: payload.createdBy,
      isActive: true,
      isDeleted: false,
    });
  }

  /** Legacy create — kept for backward compat with admin tooling. */
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
      status: RedemptionPayoutStatus.REQUESTED,
      submittedAt: new Date(),
      submittedAfterCutoff: false,
      extraInterestDays: 1,
      retryCount: 0,
      metadata: payload.metadata,
      createdBy: payload.createdBy,
      updatedBy: payload.createdBy,
      isActive: true,
      isDeleted: false,
    });
  }

  // ── Cron methods ──────────────────────────────────────────────────────────

  /**
   * Cron step 1: advance REQUESTED/PENDING_SETTLEMENT payouts whose
   * expectedPayoutDate has been reached to READY_FOR_PAYOUT.
   * Uses FOR UPDATE SKIP LOCKED for horizontal-scale safety.
   */
  async promoteReadyPayouts(): Promise<number> {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    // Raw SQL with SKIP LOCKED so concurrent cron instances don't clash
    const rows: {id: string}[] = await (this.redemptionPayoutRepository.dataSource as any).execute(
      `SELECT id
         FROM public.redemption_payouts
        WHERE status IN ('REQUESTED', 'PENDING_SETTLEMENT')
          AND expectedpayoutdate <= $1
          AND isdeleted = FALSE
        FOR UPDATE SKIP LOCKED`,
      [todayUtc],
    );

    if (!rows.length) return 0;

    await Promise.all(
      rows.map(row =>
        this.redemptionPayoutRepository.updateById(row.id, {
          status: RedemptionPayoutStatus.READY_FOR_PAYOUT,
          updatedBy: 'system:payout-cron',
        }),
      ),
    );

    console.log(`[RedemptionPayoutCron] Promoted ${rows.length} payout(s) to READY_FOR_PAYOUT`);
    return rows.length;
  }

  /**
   * Cron step 2: process READY_FOR_PAYOUT records.
   * Marks them PAYOUT_PROCESSING, attempts transfer, then marks PAID or FAILED/RETRY_PENDING.
   * Uses SKIP LOCKED to prevent double-processing.
   */
  async dispatchPendingTransfers(): Promise<number> {
    const rows: {id: string}[] = await (this.redemptionPayoutRepository.dataSource as any).execute(
      `SELECT id
         FROM public.redemption_payouts
        WHERE status = 'READY_FOR_PAYOUT'
          AND isdeleted = FALSE
        ORDER BY expectedpayoutdate ASC
        FOR UPDATE SKIP LOCKED`,
    );

    if (!rows.length) return 0;

    let dispatched = 0;
    for (const row of rows) {
      try {
        // Mark in-flight to prevent reprocessing if cron crashes mid-loop
        await this.redemptionPayoutRepository.updateById(row.id, {
          status: RedemptionPayoutStatus.PAYOUT_PROCESSING,
          lastAttemptAt: new Date(),
          updatedBy: 'system:payout-cron',
        });

        // ── Bank transfer execution ───────────────────────────────────────
        // TODO: Integrate with NEFT/RTGS/IMPS gateway here.
        // For now the record is moved to PAID immediately. When the payment
        // gateway is wired, this block should become an async job that moves
        // the record to PAID only after the gateway callback confirms success.
        // ─────────────────────────────────────────────────────────────────
        await this.markPaid(row.id, 'system:payout-cron');
        dispatched++;
      } catch (err) {
        await this.handleTransferFailure(row.id, err);
      }
    }

    if (dispatched > 0) {
      console.log(`[RedemptionPayoutCron] Dispatched ${dispatched} payout transfer(s)`);
    }
    return dispatched;
  }

  /**
   * Cron step 3: recover payouts stuck in PAYOUT_PROCESSING after a crash.
   * Any payout that has been in-flight for longer than STALE_PROCESSING_THRESHOLD_MS
   * without being confirmed is moved back to RETRY_PENDING for re-dispatch.
   */
  async recoverStaleProcessingPayouts(): Promise<number> {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);

    const rows: {id: string}[] = await (this.redemptionPayoutRepository.dataSource as any).execute(
      `SELECT id
         FROM public.redemption_payouts
        WHERE status = 'PAYOUT_PROCESSING'
          AND lastattemptat <= $1
          AND isdeleted = FALSE
        FOR UPDATE SKIP LOCKED`,
      [staleThreshold],
    );

    if (!rows.length) return 0;

    await Promise.all(
      rows.map(row =>
        this.redemptionPayoutRepository.updateById(row.id, {
          status: RedemptionPayoutStatus.RETRY_PENDING,
          failureReason: 'Recovered from stale PAYOUT_PROCESSING state (likely crash)',
          updatedBy: 'system:payout-cron',
        }),
      ),
    );

    console.log(`[RedemptionPayoutCron] Recovered ${rows.length} stale PAYOUT_PROCESSING payout(s) → RETRY_PENDING`);
    return rows.length;
  }

  /**
   * Cron step 4: re-queue RETRY_PENDING records that haven't exceeded MAX_RETRY_ATTEMPTS.
   */
  async retryFailedPayouts(): Promise<void> {
    const rows: {id: string; retrycount: number}[] = await (
      this.redemptionPayoutRepository.dataSource as any
    ).execute(
      `SELECT id, retrycount
         FROM public.redemption_payouts
        WHERE status = 'RETRY_PENDING'
          AND retrycount < $1
          AND isdeleted = FALSE
        FOR UPDATE SKIP LOCKED`,
      [MAX_RETRY_ATTEMPTS],
    );

    for (const row of rows) {
      await this.redemptionPayoutRepository.updateById(row.id, {
        status: RedemptionPayoutStatus.READY_FOR_PAYOUT,
        updatedBy: 'system:payout-cron',
      });
    }

    if (rows.length > 0) {
      console.log(`[RedemptionPayoutCron] Re-queued ${rows.length} payout(s) for retry`);
    }
  }

  // ── Status transitions (used by cron + admin) ─────────────────────────────

  async markPaid(
    payoutId: string,
    updatedBy: string,
    transferReference?: string,
  ): Promise<RedemptionPayout> {
    await this.redemptionPayoutRepository.updateById(payoutId, {
      status: RedemptionPayoutStatus.PAID,
      settlementDate: new Date(),
      processedAt: new Date(),
      processedBy: updatedBy,
      transferReference,
      updatedBy,
    });
    return this.redemptionPayoutRepository.findById(payoutId);
  }

  async markReconciled(
    payoutId: string,
    adminUserId: string,
    transferReference?: string,
  ): Promise<RedemptionPayout> {
    const payout = await this.redemptionPayoutRepository.findById(payoutId);
    if (payout.status !== RedemptionPayoutStatus.PAID) {
      throw new HttpErrors.BadRequest(
        `Only PAID payouts can be reconciled. Current: '${payout.status}'`,
      );
    }
    await this.redemptionPayoutRepository.updateById(payoutId, {
      status: RedemptionPayoutStatus.RECONCILED,
      processedBy: adminUserId,
      transferReference: transferReference ?? payout.transferReference,
      updatedBy: adminUserId,
    });
    return this.redemptionPayoutRepository.findById(payoutId);
  }

  async markProcessing(payoutId: string, adminUserId: string): Promise<RedemptionPayout> {
    const payout = await this.redemptionPayoutRepository.findById(payoutId);
    if (
      payout.status !== RedemptionPayoutStatus.READY_FOR_PAYOUT &&
      payout.status !== RedemptionPayoutStatus.PENDING // legacy
    ) {
      throw new HttpErrors.BadRequest(
        `Payout must be READY_FOR_PAYOUT to mark PROCESSING. Current: '${payout.status}'`,
      );
    }
    await this.redemptionPayoutRepository.updateById(payoutId, {
      status: RedemptionPayoutStatus.PAYOUT_PROCESSING,
      processedBy: adminUserId,
      processedAt: new Date(),
      lastAttemptAt: new Date(),
      updatedBy: adminUserId,
    });
    return this.redemptionPayoutRepository.findById(payoutId);
  }

  async cancelPayout(
    payoutId: string,
    adminUserId: string,
    reason: string,
  ): Promise<RedemptionPayout> {
    const payout = await this.redemptionPayoutRepository.findById(payoutId);
    if (TERMINAL_STATUSES.includes(payout.status)) {
      throw new HttpErrors.BadRequest(
        `Cannot cancel a payout in terminal status '${payout.status}'`,
      );
    }
    await this.redemptionPayoutRepository.updateById(payoutId, {
      status: RedemptionPayoutStatus.CANCELLED,
      failureReason: reason,
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
    options?: {transferReference?: string; failureReason?: string},
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
    if (options?.transferReference) updatePayload.transferReference = options.transferReference;
    if (options?.failureReason) updatePayload.failureReason = options.failureReason;

    await this.redemptionPayoutRepository.updateById(payoutId, updatePayload);
    return this.redemptionPayoutRepository.findById(payoutId);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

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

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async handleTransferFailure(payoutId: string, err: unknown): Promise<void> {
    try {
      const payout = await this.redemptionPayoutRepository.findById(payoutId);
      const retryCount = (payout.retryCount ?? 0) + 1;
      const nextStatus =
        retryCount < MAX_RETRY_ATTEMPTS
          ? RedemptionPayoutStatus.RETRY_PENDING
          : RedemptionPayoutStatus.FAILED;

      await this.redemptionPayoutRepository.updateById(payoutId, {
        status: nextStatus,
        retryCount,
        lastAttemptAt: new Date(),
        failureReason:
          err instanceof Error ? err.message : String(err),
        updatedBy: 'system:payout-cron',
      });
    } catch (updateErr) {
      console.error(`[RedemptionPayoutCron] Failed to record transfer failure for ${payoutId}`, updateErr);
    }
  }

  private buildWhereFromFilters(filters: RedemptionPayoutListFilters): object[] {
    const where: object[] = [{isDeleted: false}];
    if (filters.spvId) where.push({spvId: filters.spvId});
    if (filters.status) where.push({status: filters.status});
    if (filters.investorProfileId) where.push({investorProfileId: filters.investorProfileId});
    if (filters.fromDate) where.push({createdAt: {gte: new Date(filters.fromDate)}});
    if (filters.toDate) where.push({createdAt: {lte: new Date(filters.toDate)}});
    return where;
  }
}
