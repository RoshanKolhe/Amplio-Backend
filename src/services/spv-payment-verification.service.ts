import {inject} from '@loopback/core';
import {IsolationLevel, juggler, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {
  InvestmentOrder,
  SpvPaymentVerification,
  SpvPaymentVerificationStatus,
} from '../models';
import {
  EscrowSetupRepository,
  InvestmentOrderRepository,
  InvestorProfileRepository,
  PoolFinancialsRepository,
  SpvPaymentVerificationRepository,
  SpvRepository,
} from '../repositories';
import {PtcIssuanceService, UnitReservation} from './ptc-issuance.service';
import {PoolFinancials} from '../models/pool-financials.model';

// IST is UTC+5:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const PAYMENT_INTENT_EXPIRY_HOURS = 48;
const AMOUNT_VARIANCE_THRESHOLD_PERCENT = 5;
const PENDING_WINDOW_MINUTES = 10;

export type VerificationListFilters = {
  spvId?: string;
  status?: string;
  investorProfileId?: string;
  utrNumber?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'amount' | 'updatedAt' | 'verifiedAt';
  sortOrder?: 'ASC' | 'DESC';
};

export type VerificationListResult = {
  data: SpvPaymentVerification[];
  total: number;
  limit: number;
  offset: number;
};

export type TimelineEvent = {
  event: string;
  status: SpvPaymentVerificationStatus | null;
  timestamp: Date | string | null;
  actor: string | null;
  note: string | null;
};

export type AdminNote = {
  id: string;
  note: string;
  addedBy: string;
  addedAt: string;
};

export type VerificationMetadata = {
  notes?: AdminNote[];
  [key: string]: unknown;
};

export type VerificationDetail = {
  verification: SpvPaymentVerification;
  investorName: string | null;
  spvName: string | null;
  timeline: TimelineEvent[];
  adminNotes: AdminNote[];
};

const APPROVABLE_STATUSES: SpvPaymentVerificationStatus[] = [
  SpvPaymentVerificationStatus.SUBMITTED,
  SpvPaymentVerificationStatus.PENDING,
  SpvPaymentVerificationStatus.SUSPICIOUS,
];

const NON_REJECTABLE_STATUSES: SpvPaymentVerificationStatus[] = [
  SpvPaymentVerificationStatus.ALLOCATED,
  SpvPaymentVerificationStatus.REJECTED,
  SpvPaymentVerificationStatus.REVERSED,
  SpvPaymentVerificationStatus.EXPIRED,
];

const RETRYABLE_ALLOCATION_STATUSES: SpvPaymentVerificationStatus[] = [
  SpvPaymentVerificationStatus.VERIFIED,
  SpvPaymentVerificationStatus.AUTO_VERIFIED,
];

export type PaymentInstructions = {
  spvName: string | null;
  beneficiary: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  maskedAccountNumber: string;
  ifscCode: string;
  branchDetails: string | null;
  accountType: string;
  amount: number | null;
  transferAmount: number | null;
  referenceId: string | null;
  verificationId: string | null;
  orderId: string | null;
  paymentDeadlineAt: Date | null;
  reservationExpiresAt: Date | null;
  timerEndsAt: Date | null;
  timeRemainingSeconds: number;
  verificationStatus: SpvPaymentVerificationStatus | null;
};

export type FlowStep = {
  stepNumber: number;
  label: string;
  status: 'completed' | 'active' | 'pending' | 'error';
};

export type InvestmentFlowState = {
  verificationId: string;
  spvId: string;
  verificationStatus: SpvPaymentVerificationStatus;
  currentStep: number;
  totalSteps: number;
  steps: FlowStep[];
  canSubmitUtr: boolean;
  isComplete: boolean;
  isRejected: boolean;
  isExpired: boolean;
  amount: number | null;
  referenceId: string | null;
  orderId: string | null;
  paymentDeadlineAt: Date | null;
  reservationExpiresAt: Date | null;
  pendingWindowExpiresAt: Date | null;
  timerEndsAt: Date | null;
  timeRemainingSeconds: number;
  resumeAction: 'submit_utr' | 'create_new_intent' | null;
};

type VerificationInstructionContext = {
  verification: SpvPaymentVerification | null;
  order: InvestmentOrder | null;
};

function buildInvestmentFlowState(
  verification: SpvPaymentVerification,
): InvestmentFlowState {
  const STEP_LABELS = [
    'Agreement',
    'Payment Instructions',
    'UTR Upload',
    'Verification',
    'Allocation Complete',
  ];
  const TOTAL_STEPS = STEP_LABELS.length;

  const s = verification.status;

  // Determine current step, error/active semantics, and action hint
  let currentStep: number;
  let isErrorStep = false;
  let canSubmitUtr = false;
  let resumeAction: InvestmentFlowState['resumeAction'] = null;

  if (s === SpvPaymentVerificationStatus.PENDING) {
    currentStep = 3; // UTR Upload
    canSubmitUtr = true;
    resumeAction = 'submit_utr';
  } else if (
    s === SpvPaymentVerificationStatus.SUBMITTED ||
    s === SpvPaymentVerificationStatus.SUSPICIOUS
  ) {
    currentStep = 4; // Verification
  } else if (
    s === SpvPaymentVerificationStatus.VERIFIED ||
    s === SpvPaymentVerificationStatus.AUTO_VERIFIED
  ) {
    currentStep = 4; // Verification (allocation in progress)
  } else if (s === SpvPaymentVerificationStatus.ALLOCATED) {
    currentStep = 5; // Complete
  } else if (
    s === SpvPaymentVerificationStatus.EXPIRED ||
    s === SpvPaymentVerificationStatus.TIME_EXCEEDED
  ) {
    currentStep = 3; // expired at UTR upload step
    isErrorStep = true;
    resumeAction = 'create_new_intent';
  } else if (
    s === SpvPaymentVerificationStatus.REJECTED ||
    s === SpvPaymentVerificationStatus.REVERSED
  ) {
    currentStep = 4; // failed at verification
    isErrorStep = true;
    resumeAction = 'create_new_intent';
  } else {
    currentStep = 3;
  }

  const steps: FlowStep[] = STEP_LABELS.map((label, index) => {
    const stepNumber = index + 1;
    let status: FlowStep['status'];

    if (isErrorStep && stepNumber === currentStep) {
      status = 'error';
    } else if (
      stepNumber < currentStep ||
      (s === SpvPaymentVerificationStatus.ALLOCATED && stepNumber === currentStep)
    ) {
      status = 'completed';
    } else if (!isErrorStep && stepNumber === currentStep) {
      status = 'active';
    } else {
      status = 'pending';
    }

    return {stepNumber, label, status};
  });

  let pendingWindowExpiresAt: Date | null = null;
  if (s === SpvPaymentVerificationStatus.PENDING && verification.createdAt) {
    const createdMs = new Date(verification.createdAt).getTime();
    pendingWindowExpiresAt = new Date(createdMs + PENDING_WINDOW_MINUTES * 60 * 1000);
  }

  return {
    verificationId: verification.id,
    spvId: verification.spvId,
    verificationStatus: s,
    currentStep,
    totalSteps: TOTAL_STEPS,
    steps,
    canSubmitUtr,
    isComplete: s === SpvPaymentVerificationStatus.ALLOCATED,
    isRejected: s === SpvPaymentVerificationStatus.REJECTED,
    isExpired: s === SpvPaymentVerificationStatus.EXPIRED,
    amount: verification.amount ?? null,
    referenceId: verification.referenceId ?? null,
    orderId: verification.orderId ?? null,
    paymentDeadlineAt: null,
    reservationExpiresAt: (verification.reservationExpiresAt as Date | null) ?? null,
    pendingWindowExpiresAt,
    timerEndsAt: null,
    timeRemainingSeconds: 0,
    resumeAction,
  };
}

export class SpvPaymentVerificationService {
  constructor(
    @repository(SpvPaymentVerificationRepository)
    private spvPaymentVerificationRepository: SpvPaymentVerificationRepository,
    @repository(InvestmentOrderRepository)
    private investmentOrderRepository: InvestmentOrderRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(EscrowSetupRepository)
    private escrowSetupRepository: EscrowSetupRepository,
    @inject('service.ptcIssuance.service')
    private ptcIssuanceService: PtcIssuanceService,
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
  ) {}

  private computeTimerEndAt(
    verification: SpvPaymentVerification | null,
    order: InvestmentOrder | null,
  ): Date | null {
    if (!verification) {
      return order?.paymentDeadlineAt ?? null;
    }

    if (verification.status === SpvPaymentVerificationStatus.PENDING) {
      if (verification.createdAt) {
        return new Date(
          new Date(verification.createdAt).getTime() +
            PENDING_WINDOW_MINUTES * 60 * 1000,
        );
      }

      return order?.paymentDeadlineAt ?? null;
    }

    return (
      verification.reservationExpiresAt ??
      order?.freezeExpiresAt ??
      order?.paymentDeadlineAt ??
      null
    );
  }

  private getTimeRemainingSeconds(expiresAt: Date | null): number {
    if (!expiresAt) return 0;
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    return remainingMs > 0 ? Math.floor(remainingMs / 1000) : 0;
  }

  private async getVerificationInstructionContext(
    investorProfileId: string,
    spvId: string,
  ): Promise<VerificationInstructionContext> {
    const verifications = await this.spvPaymentVerificationRepository.find({
      where: {
        and: [{investorProfileId}, {spvId}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
      limit: 1,
    });

    const verification = verifications[0] ?? null;
    if (!verification) {
      return {verification: null, order: null};
    }

    let order: InvestmentOrder | null = null;

    if (verification.orderId) {
      try {
        order = await this.investmentOrderRepository.findById(verification.orderId);
      } catch {
        order = null;
      }
    }

    if (!order) {
      order = await this.investmentOrderRepository.findOne({
        where: {
          and: [
            {verificationId: verification.id},
            {investorProfileId},
            {isDeleted: false},
          ],
        },
      });
    }

    return {verification, order};
  }

  private async resolveInvestorProfileId(usersId: string): Promise<string> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{usersId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Active investor profile not found');
    }

    return investorProfile.id;
  }

  private buildWhereFromFilters(filters: VerificationListFilters): object[] {
    const where: object[] = [{isDeleted: false}];

    if (filters.spvId) where.push({spvId: filters.spvId});
    if (filters.status) where.push({status: filters.status});
    if (filters.investorProfileId) where.push({investorProfileId: filters.investorProfileId});
    if (filters.utrNumber) where.push({utrNumber: filters.utrNumber});

    if (filters.fromDate) {
      where.push({createdAt: {gte: new Date(filters.fromDate)}});
    }
    if (filters.toDate) {
      where.push({createdAt: {lte: new Date(filters.toDate)}});
    }
    if (filters.minAmount !== undefined) {
      where.push({amount: {gte: filters.minAmount}});
    }
    if (filters.maxAmount !== undefined) {
      where.push({amount: {lte: filters.maxAmount}});
    }
    if (filters.search) {
      where.push({
        or: [
          {referenceId: {like: `%${filters.search}%`}},
          {utrNumber: {like: `%${filters.search}%`}},
        ],
      });
    }

    return where;
  }

  private buildTimeline(verification: SpvPaymentVerification): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    events.push({
      event: 'Payment intent created',
      status: SpvPaymentVerificationStatus.PENDING,
      timestamp: verification.createdAt ?? null,
      actor: verification.createdBy ?? null,
      note: null,
    });

    if (verification.utrNumber) {
      events.push({
        event: 'UTR submitted',
        status: SpvPaymentVerificationStatus.SUBMITTED,
        timestamp: null,
        actor: verification.createdBy ?? null,
        note: `UTR: ${verification.utrNumber}`,
      });
    }

    if (
      verification.status === SpvPaymentVerificationStatus.SUSPICIOUS ||
      (verification.metadata as VerificationMetadata)?.suspiciousMarkedAt
    ) {
      const meta = verification.metadata as VerificationMetadata | undefined;
      events.push({
        event: 'Marked suspicious',
        status: SpvPaymentVerificationStatus.SUSPICIOUS,
        timestamp: (meta?.suspiciousMarkedAt as string | null) ?? null,
        actor: (meta?.suspiciousMarkedBy as string | null) ?? null,
        note: verification.suspiciousReason ?? null,
      });
    }

    if (
      verification.verifiedAt &&
      [
        SpvPaymentVerificationStatus.VERIFIED,
        SpvPaymentVerificationStatus.AUTO_VERIFIED,
        SpvPaymentVerificationStatus.ALLOCATED,
      ].includes(verification.status)
    ) {
      const isAuto = (verification.metadata as VerificationMetadata)?.autoVerified === true;
      events.push({
        event: isAuto ? 'Auto-verified from transaction match' : 'Verified by admin',
        status: isAuto
          ? SpvPaymentVerificationStatus.AUTO_VERIFIED
          : SpvPaymentVerificationStatus.VERIFIED,
        timestamp: verification.verifiedAt,
        actor: verification.verifiedBy ?? null,
        note: verification.verifiedAmount
          ? `Verified amount: ₹${verification.verifiedAmount}`
          : null,
      });
    }

    if (verification.allocatedAt && verification.status === SpvPaymentVerificationStatus.ALLOCATED) {
      events.push({
        event: 'Units allocated',
        status: SpvPaymentVerificationStatus.ALLOCATED,
        timestamp: verification.allocatedAt,
        actor: verification.updatedBy ?? null,
        note: verification.allocatedUnits
          ? `Allocated ${verification.allocatedUnits} units`
          : null,
      });
    }

    if (verification.status === SpvPaymentVerificationStatus.REJECTED) {
      events.push({
        event: 'Verification rejected',
        status: SpvPaymentVerificationStatus.REJECTED,
        timestamp: verification.updatedAt ?? null,
        actor: verification.updatedBy ?? null,
        note: verification.rejectionReason ?? null,
      });
    }

    if (verification.status === SpvPaymentVerificationStatus.REVERSED) {
      events.push({
        event: 'Verification reversed',
        status: SpvPaymentVerificationStatus.REVERSED,
        timestamp: verification.updatedAt ?? null,
        actor: verification.updatedBy ?? null,
        note: null,
      });
    }

    return events;
  }

  private extractAdminNotes(verification: SpvPaymentVerification): AdminNote[] {
    const meta = verification.metadata as VerificationMetadata | undefined;
    return meta?.notes ?? [];
  }

  async createPaymentIntent(
    currentUser: UserProfile,
    spvId: string,
    units: number,
    amount: number,
  ): Promise<SpvPaymentVerification> {
    if (!Number.isInteger(units) || units <= 0) {
      throw new HttpErrors.BadRequest('Units must be a positive integer');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpErrors.BadRequest('Amount must be a positive number');
    }

    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);

    // Enforce cutoff window when opted in
    const poolFinancials = await this.poolFinancialsRepository.findOne({
      where: {spvId, isActive: true, isDeleted: false},
    });
    if (poolFinancials?.enforceCutoffWindow) {
      if (!this.isWithinTradingWindow(poolFinancials)) {
        const morning = poolFinancials.morningCutoffTime ?? '09:00:00';
        const evening = poolFinancials.eveningCutoffTime ?? '15:00:00';
        throw new HttpErrors.BadRequest(
          `Investments for this pool are only accepted between ${morning} and ${evening} IST. Please try again during trading hours.`,
        );
      }
    }

    const referenceId = uuidv4();

    return this.spvPaymentVerificationRepository.create({
      id: uuidv4(),
      investorProfileId,
      spvId,
      referenceId,
      amount,
      units,
      status: SpvPaymentVerificationStatus.PENDING,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
      isActive: true,
      isDeleted: false,
    });
  }

  async submitUtr(
    currentUser: UserProfile,
    verificationId: string,
    utrNumber: string,
    screenshotUrl?: string,
  ): Promise<SpvPaymentVerification> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    const normalizedUtr = utrNumber.trim();

    const ds = (this.spvPaymentVerificationRepository as unknown as {dataSource: juggler.DataSource}).dataSource;
    const tx = await ds.beginTransaction(IsolationLevel.READ_COMMITTED);

    try {
      // Lock the verification row — blocks any concurrent submitUtr for the same verification
      await ds.execute(
        'SELECT id FROM spv_payment_verifications WHERE id = $1 FOR UPDATE',
        [verificationId],
        {transaction: tx},
      );

      // Re-read within the transaction after acquiring the lock
      const verification = await this.spvPaymentVerificationRepository.findById(
        verificationId, undefined, {transaction: tx},
      );

      if (verification.investorProfileId !== investorProfileId) {
        throw new HttpErrors.Forbidden('Not authorized to update this verification');
      }

      if (verification.status !== SpvPaymentVerificationStatus.PENDING) {
        throw new HttpErrors.BadRequest(
          `Verification must be in PENDING status to submit UTR (current: ${verification.status})`,
        );
      }

      await this.assertPaymentWindowOpen(verification, tx);

      // Duplicate UTR check within the same transaction for serializable reads
      const conflictingVerification = await this.findConflictingUtr(
        normalizedUtr, verification.spvId, verificationId, tx,
      );
      if (conflictingVerification) {
        throw new HttpErrors.Conflict(
          `UTR ${normalizedUtr} has already been submitted for this SPV (conflicting verification: ${conflictingVerification.id}, status: ${conflictingVerification.status})`,
        );
      }

      // Load pool config now that we know spvId from the locked row
      const poolFinancials = await this.poolFinancialsRepository.findOne({
        where: {spvId: verification.spvId, isActive: true, isDeleted: false},
      });
      const submittedInWindow = poolFinancials
        ? this.isWithinTradingWindow(poolFinancials)
        : true;
      const allocationDate = this.computeAllocationDate(poolFinancials ?? null);

      // Reserve units within the SAME transaction — atomic with the status check above.
      // If reservation fails the entire tx rolls back and the verification stays PENDING.
      const reserveResult = await this.ptcIssuanceService.reserveUnitsForVerification(
        verification.spvId, verification.units, verificationId, tx,
      );

      const existingMeta = (verification.metadata ?? {}) as VerificationMetadata;
      const updatePayload: Partial<SpvPaymentVerification> = {
        utrNumber: normalizedUtr,
        status: SpvPaymentVerificationStatus.SUBMITTED,
        updatedBy: currentUser.id,
        metadata: {...existingMeta, reservation: reserveResult.reservations},
        reservedUnits: verification.units,
        unitsReservedAt: new Date(),
        reservationExpiresAt: reserveResult.expiresAt,
        freezeExpiresAt: reserveResult.expiresAt,
        reservationStatus: 'RESERVED',
        submittedInWindow,
        allocationDate,
      };

      if (screenshotUrl) updatePayload.screenshotUrl = screenshotUrl;

      await this.spvPaymentVerificationRepository.updateById(
        verificationId, updatePayload, {transaction: tx},
      );

      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  private assertNotExpired(verification: SpvPaymentVerification): void {
    if (!verification.createdAt) return;
    const ageMs = Date.now() - new Date(verification.createdAt).getTime();
    const expiryMs = PAYMENT_INTENT_EXPIRY_HOURS * 60 * 60 * 1000;
    if (ageMs > expiryMs) {
      throw new HttpErrors.BadRequest(
        `Payment intent has expired (created more than ${PAYMENT_INTENT_EXPIRY_HOURS} hours ago). Please create a new payment intent.`,
      );
    }
  }

  // Validates that the payment window is still open using the exact paymentDeadlineAt
  // timestamp on the linked InvestmentOrder. This keeps the backend perfectly aligned
  // with the frontend countdown timer and the PaymentWindowTimeoutCron, which all use
  // the same source of truth. Falls back to the generic elapsed-time check only when no
  // order is linked (standalone verifications created outside the order flow).
  private async assertPaymentWindowOpen(
    verification: SpvPaymentVerification,
    tx?: unknown,
  ): Promise<void> {
    if (!verification.orderId) {
      this.assertNotExpired(verification);
      return;
    }

    let order;
    try {
      order = await this.investmentOrderRepository.findById(
        verification.orderId,
        undefined,
        tx ? {transaction: tx} : undefined,
      );
    } catch {
      // Order not found — fall back to generic check rather than hard-failing
      this.assertNotExpired(verification);
      return;
    }

    if (order.paymentDeadlineAt && new Date(order.paymentDeadlineAt) <= new Date()) {
      throw new HttpErrors.BadRequest(
        'Payment window has expired. Please create a new order to invest.',
      );
    }
  }

  // Returns true when the current IST wall-clock time falls within the pool's trading window
  private isWithinTradingWindow(pool: PoolFinancials): boolean {
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const morningStr = pool.morningCutoffTime ?? '09:00:00';
    const eveningStr = pool.eveningCutoffTime ?? '15:00:00';

    const [mh, mm] = morningStr.split(':').map(Number);
    const [eh, em] = eveningStr.split(':').map(Number);

    const nowMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
    const morningMinutes = mh * 60 + mm;
    const eveningMinutes = eh * 60 + em;

    return nowMinutes >= morningMinutes && nowMinutes < eveningMinutes;
  }

  // Same day if submitted before OR within the window; next business day only if submitted AFTER window closes
  private computeAllocationDate(pool: PoolFinancials | null): Date {
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const base = new Date(istNow.toISOString().split('T')[0] + 'T00:00:00.000Z');

    if (!pool) return base;

    const eveningStr = pool.eveningCutoffTime ?? '15:00:00';
    const [eh, em] = eveningStr.split(':').map(Number);
    const eveningMinutes = eh * 60 + em;
    const nowMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

    // Only advance to next business day when submitted AFTER the evening cutoff
    if (nowMinutes >= eveningMinutes) {
      base.setUTCDate(base.getUTCDate() + 1);
      while (base.getUTCDay() === 0 || base.getUTCDay() === 6) {
        base.setUTCDate(base.getUTCDate() + 1);
      }
    }

    return base;
  }

  private async findConflictingUtr(
    utrNumber: string,
    spvId: string,
    excludeVerificationId: string,
    tx?: unknown,
  ): Promise<SpvPaymentVerification | undefined> {
    const activeStatuses: SpvPaymentVerificationStatus[] = [
      SpvPaymentVerificationStatus.SUBMITTED,
      SpvPaymentVerificationStatus.VERIFIED,
      SpvPaymentVerificationStatus.AUTO_VERIFIED,
      SpvPaymentVerificationStatus.ALLOCATED,
      SpvPaymentVerificationStatus.SUSPICIOUS,
    ];

    const conflicts = await this.spvPaymentVerificationRepository.find(
      {
        where: {
          and: [
            {utrNumber},
            {spvId},
            {isDeleted: false},
            {status: {inq: activeStatuses}},
          ],
        },
        limit: 1,
      },
      tx ? {transaction: tx} : undefined,
    );

    return conflicts.find(v => v.id !== excludeVerificationId);
  }

  async getInvestorVerifications(
    currentUser: UserProfile,
    spvId?: string,
  ): Promise<SpvPaymentVerification[]> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    const where: object[] = [
      {investorProfileId},
      {isDeleted: false},
    ];

    if (spvId) {
      where.push({spvId});
    }

    return this.spvPaymentVerificationRepository.find({
      where: {and: where},
      order: ['createdAt DESC'],
    });
  }

  async approveVerification(
    verificationId: string,
    verifiedAmount: number,
    adminUserId: string,
  ): Promise<SpvPaymentVerification> {
    // Read first for validation and metadata (not the authority — updateAll is)
    const verification =
      await this.spvPaymentVerificationRepository.findById(verificationId);

    if (!APPROVABLE_STATUSES.includes(verification.status)) {
      throw new HttpErrors.BadRequest(
        `Verification cannot be approved from status '${verification.status}'`,
      );
    }

    const updateFields: Partial<SpvPaymentVerification> = {
      status: SpvPaymentVerificationStatus.VERIFIED,
      verificationStatus: 1, // Approved
      verifiedAmount,
      verifiedBy: adminUserId,
      verifiedAt: new Date(),
      updatedBy: adminUserId,
      // Transitions reservationStatus to CONSUMING so the cron's SKIP LOCKED query
      // (which filters for reservationstatus = 'RESERVED') does not race with this approval.
      reservationStatus: 'CONSUMING',
    };

    const variance = Math.abs(verifiedAmount - verification.amount) / verification.amount * 100;
    if (variance > AMOUNT_VARIANCE_THRESHOLD_PERCENT) {
      const existingMeta = (verification.metadata ?? {}) as VerificationMetadata;
      updateFields.metadata = {
        ...existingMeta,
        amountVariance: {
          requestedAmount: verification.amount,
          verifiedAmount,
          variancePercent: Number(variance.toFixed(2)),
          flaggedAt: new Date().toISOString(),
          flaggedBy: adminUserId,
        },
      };
      console.warn(
        `[SpvPaymentVerification] Amount variance ${variance.toFixed(1)}% for ${verificationId}: requested ${verification.amount}, verified ${verifiedAmount}`,
      );
    }

    // Atomic claim — only succeeds if the verification is still in an approvable status.
    // A concurrent approve or cron expiry that already changed the status will cause count = 0.
    const claimResult = await this.spvPaymentVerificationRepository.updateAll(
      updateFields,
      {
        and: [
          {id: verificationId},
          {status: {inq: APPROVABLE_STATUSES}},
        ],
      },
    );

    if (claimResult.count === 0) {
      throw new HttpErrors.Conflict(
        `Verification ${verificationId} was already processed by a concurrent operation and cannot be approved.`,
      );
    }

    // runAllocation has its own pg_advisory_xact_lock + ALLOCATED idempotency guard
    await this.runAllocation(verification, verification.units, adminUserId);

    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  async rejectVerification(
    verificationId: string,
    rejectionReason: string,
    adminUserId: string,
  ): Promise<SpvPaymentVerification> {
    const ds = (this.spvPaymentVerificationRepository as unknown as {dataSource: juggler.DataSource}).dataSource;
    const tx = await ds.beginTransaction(IsolationLevel.READ_COMMITTED);

    try {
      // Row-level lock — cron's SKIP LOCKED will skip this row while we hold it,
      // preventing concurrent expiry from double-releasing the same reservation.
      await ds.execute(
        'SELECT id FROM spv_payment_verifications WHERE id = $1 FOR UPDATE',
        [verificationId],
        {transaction: tx},
      );

      const verification = await this.spvPaymentVerificationRepository.findById(
        verificationId, undefined, {transaction: tx},
      );

      if (NON_REJECTABLE_STATUSES.includes(verification.status)) {
        throw new HttpErrors.BadRequest(
          `Verification cannot be rejected from status '${verification.status}'`,
        );
      }

      if (verification.reservationStatus === 'RESERVED') {
        const meta = (verification.metadata ?? {}) as VerificationMetadata;
        const reservations = (meta.reservation as UnitReservation[] | undefined) ?? [];
        if (reservations.length > 0) {
          // Release within the same tx — rolls back if anything below fails
          await this.ptcIssuanceService.releaseUnitsReservation(
            reservations,
            `rejected: ${rejectionReason}`,
            tx,
          );
        }
      }

      await this.spvPaymentVerificationRepository.updateById(verificationId, {
        status: SpvPaymentVerificationStatus.REJECTED,
        verificationStatus: 2, // Rejected
        rejectionReason,
        updatedBy: adminUserId,
        reservationStatus:
          verification.reservationStatus === 'RESERVED'
            ? 'RELEASED'
            : verification.reservationStatus,
      }, {transaction: tx});

      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  async markSuspicious(
    verificationId: string,
    reason: string,
    adminUserId: string,
  ): Promise<SpvPaymentVerification> {
    const verification =
      await this.spvPaymentVerificationRepository.findById(verificationId);

    const nonSuspiciableStatuses: SpvPaymentVerificationStatus[] = [
      SpvPaymentVerificationStatus.ALLOCATED,
      SpvPaymentVerificationStatus.REVERSED,
      SpvPaymentVerificationStatus.EXPIRED,
    ];

    if (nonSuspiciableStatuses.includes(verification.status)) {
      throw new HttpErrors.BadRequest(
        `Verification cannot be flagged as suspicious from status '${verification.status}'`,
      );
    }

    const existingMeta = (verification.metadata ?? {}) as VerificationMetadata;

    await this.spvPaymentVerificationRepository.updateById(verificationId, {
      status: SpvPaymentVerificationStatus.SUSPICIOUS,
      suspiciousReason: reason,
      updatedBy: adminUserId,
      metadata: {
        ...existingMeta,
        suspiciousMarkedBy: adminUserId,
        suspiciousMarkedAt: new Date().toISOString(),
        previousStatus: verification.status,
      },
    });

    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  async addAdminNote(
    verificationId: string,
    note: string,
    adminUserId: string,
  ): Promise<SpvPaymentVerification> {
    const verification =
      await this.spvPaymentVerificationRepository.findById(verificationId);

    const existingMeta = (verification.metadata ?? {}) as VerificationMetadata;
    const existingNotes: AdminNote[] = existingMeta.notes ?? [];

    const newNote: AdminNote = {
      id: uuidv4(),
      note: note.trim(),
      addedBy: adminUserId,
      addedAt: new Date().toISOString(),
    };

    await this.spvPaymentVerificationRepository.updateById(verificationId, {
      updatedBy: adminUserId,
      metadata: {
        ...existingMeta,
        notes: [...existingNotes, newNote],
      },
    });

    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  async retryAllocation(
    verificationId: string,
    adminUserId: string,
  ): Promise<SpvPaymentVerification> {
    const verification =
      await this.spvPaymentVerificationRepository.findById(verificationId);

    if (!RETRYABLE_ALLOCATION_STATUSES.includes(verification.status)) {
      throw new HttpErrors.BadRequest(
        `Allocation retry is only allowed from VERIFIED or AUTO_VERIFIED status. Current: '${verification.status}'`,
      );
    }

    await this.runAllocation(verification, verification.units, adminUserId);

    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  async listVerificationsForAdmin(
    filters: VerificationListFilters = {},
  ): Promise<VerificationListResult> {
    const where = {and: this.buildWhereFromFilters(filters)};
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;
    const sortField = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'DESC';

    const [data, countResult] = await Promise.all([
      this.spvPaymentVerificationRepository.find({
        where,
        order: [`${sortField} ${sortOrder}`],
        limit,
        skip: offset,
        include: ['investorProfile', 'spv'],
      }),
      this.spvPaymentVerificationRepository.count(where),
    ]);

    return {data, total: countResult.count, limit, offset};
  }

  async getVerificationById(
    verificationId: string,
  ): Promise<SpvPaymentVerification> {
    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  async getVerificationWithDetails(verificationId: string): Promise<VerificationDetail> {
    const verification = await this.spvPaymentVerificationRepository.findById(
      verificationId,
      {include: ['investorProfile', 'spv']},
    );

    const raw = verification as SpvPaymentVerification & {
      investorProfile?: {fullName?: string};
      spv?: {spvName?: string};
    };

    return {
      verification,
      investorName: raw.investorProfile?.fullName ?? null,
      spvName: raw.spv?.spvName ?? null,
      timeline: this.buildTimeline(verification),
      adminNotes: this.extractAdminNotes(verification),
    };
  }

  async getTransactionTimeline(verificationId: string): Promise<TimelineEvent[]> {
    const verification =
      await this.spvPaymentVerificationRepository.findById(verificationId);
    return this.buildTimeline(verification);
  }

  async autoVerifyFromTransaction(
    transactionId: string,
    spvId: string,
    amount: number,
  ): Promise<void> {
    const candidates = await this.spvPaymentVerificationRepository.find({
      where: {
        and: [
          {spvId},
          {amount},
          {status: SpvPaymentVerificationStatus.SUBMITTED},
          {isDeleted: false},
        ],
      },
      order: ['createdAt ASC'],
      limit: 1,
    });

    const verification = candidates[0];

    if (!verification) {
      return;
    }

    await this.spvPaymentVerificationRepository.updateById(verification.id, {
      transactionId,
      status: SpvPaymentVerificationStatus.AUTO_VERIFIED,
      verifiedAt: new Date(),
      updatedBy: 'system',
      metadata: {
        ...((verification.metadata ?? {}) as VerificationMetadata),
        autoVerified: true,
      },
    });

    // Sync in-memory so runAllocation sees transactionId is already set and won't overwrite it
    verification.transactionId = transactionId;

    try {
      await this.runAllocation(verification, verification.units, 'system');
    } catch (allocationError) {
      console.error(
        `[SpvPaymentVerification] Auto-allocation failed for ${verification.id}:`,
        allocationError,
      );
    }
  }

  private async runAllocation(
    verification: SpvPaymentVerification,
    units: number,
    triggeredBy: string,
  ): Promise<void> {
    const meta = (verification.metadata ?? {}) as VerificationMetadata;
    const existingReservations =
      (meta.reservation as UnitReservation[] | undefined) ?? [];

    const allocationResult = await this.ptcIssuanceService.allocateUnitsForVerifiedPayment(
      verification.investorProfileId,
      verification.spvId,
      units,
      verification.id,
      triggeredBy,
      existingReservations.length > 0 ? existingReservations : undefined,
    );

    const updatePayload: Partial<SpvPaymentVerification> = {
      status: SpvPaymentVerificationStatus.ALLOCATED,
      verificationStatus: 1, // Approved
      allocatedUnits: units,
      allocatedAt: new Date(),
      updatedBy: triggeredBy,
      reservationStatus:
        existingReservations.length > 0 ? 'CONSUMED' : verification.reservationStatus,
    };

    // For manual approvals, verification.transactionId is null because no bank transaction
    // was matched. Write the escrow movement's UUID so the row always has a transaction reference.
    // For auto-verified cases the bank transaction ID is already on the in-memory object, so we skip.
    if (!verification.transactionId && allocationResult.transactionId) {
      updatePayload.transactionId = allocationResult.transactionId;
    }

    await this.spvPaymentVerificationRepository.updateById(verification.id, updatePayload);
  }

  async getPaymentInstructions(
    spvId: string,
    currentUser?: UserProfile,
  ): Promise<PaymentInstructions> {
    const spv = await this.spvRepository.findById(spvId);
    let verification: SpvPaymentVerification | null = null;
    let order: InvestmentOrder | null = null;

    if (currentUser) {
      const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
      ({verification, order} = await this.getVerificationInstructionContext(
        investorProfileId,
        spvId,
      ));
    }

    const escrowSetup = await this.escrowSetupRepository.findOne({
      where: {
        and: [
          {spvApplicationId: spv.spvApplicationId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!escrowSetup) {
      throw new HttpErrors.NotFound(
        'Escrow account not configured for this SPV',
      );
    }

    const accountNumber = escrowSetup.accountNumber;
    const maskedAccountNumber =
      accountNumber.length > 4
        ? 'X'.repeat(accountNumber.length - 4) + accountNumber.slice(-4)
        : accountNumber;
    const timerEndsAt = this.computeTimerEndAt(verification, order);
    const amount =
      verification?.amount ??
      order?.investmentAmount ??
      null;
    const beneficiaryName =
      spv.spvName?.trim() ? `${spv.spvName.trim()} Escrow Account` : 'SPV Escrow Account';

    return {
      spvName: spv.spvName ?? null,
      beneficiary: beneficiaryName,
      beneficiaryName,
      bankName: escrowSetup.bankName,
      accountNumber,
      maskedAccountNumber,
      ifscCode: escrowSetup.ifscCode,
      branchDetails: escrowSetup.branchDetails ?? null,
      accountType: 'Current',
      amount,
      transferAmount: amount,
      referenceId: verification?.referenceId ?? null,
      verificationId: verification?.id ?? null,
      orderId: order?.id ?? verification?.orderId ?? null,
      paymentDeadlineAt: order?.paymentDeadlineAt ?? null,
      reservationExpiresAt: verification?.reservationExpiresAt ?? null,
      timerEndsAt,
      timeRemainingSeconds: this.getTimeRemainingSeconds(timerEndsAt),
      verificationStatus: verification?.status ?? null,
    };
  }

  async expireVerification(
    verificationId: string,
    investorProfileId: string,
  ): Promise<SpvPaymentVerification> {
    const verification = await this.spvPaymentVerificationRepository.findById(verificationId);

    if (verification.investorProfileId !== investorProfileId) {
      throw new HttpErrors.Forbidden('Not authorized');
    }

    if (verification.status !== SpvPaymentVerificationStatus.PENDING) {
      return verification;
    }

    await this.spvPaymentVerificationRepository.updateById(verificationId, {
      status: SpvPaymentVerificationStatus.TIME_EXCEEDED,
      updatedAt: new Date(),
    });

    return this.spvPaymentVerificationRepository.findById(verificationId);
  }

  async getFlowState(
    verificationId: string,
    currentUser: UserProfile,
  ): Promise<InvestmentFlowState> {
    const verification =
      await this.spvPaymentVerificationRepository.findById(verificationId);
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);

    if (verification.investorProfileId !== investorProfileId) {
      throw new HttpErrors.Forbidden(
        'Not authorized to view this verification',
      );
    }

    const flowState = buildInvestmentFlowState(verification);
    const order = verification.orderId
      ? await this.investmentOrderRepository.findById(verification.orderId).catch(() => null)
      : await this.investmentOrderRepository.findOne({
          where: {
            and: [
              {verificationId},
              {investorProfileId},
              {isDeleted: false},
            ],
          },
        });
    const timerEndsAt = this.computeTimerEndAt(verification, order);

    return {
      ...flowState,
      amount: verification.amount ?? null,
      referenceId: verification.referenceId ?? null,
      orderId: order?.id ?? verification.orderId ?? null,
      paymentDeadlineAt: order?.paymentDeadlineAt ?? null,
      timerEndsAt,
      timeRemainingSeconds: this.getTimeRemainingSeconds(timerEndsAt),
    };
  }
}
