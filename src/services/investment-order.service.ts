
import {inject} from '@loopback/core';
import {DataObject, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {
  ACTIVE_ORDER_STATUSES,
  Escalation,
  EscalationStatus,
  EscalationType,
  InvestmentOrder,
  InvestmentOrderStatus,
  PaymentAttempt,
  PaymentAttemptStatus,
  PtcFreeze,
  PtcFreezeReason,
  PtcFreezeReleaseReason,
  PtcFreezeStatus,
  SpvPaymentVerificationStatus,
} from '../models';
import {
  EscalationRepository,
  InvestmentOrderRepository,
  InvestorProfileRepository,
  PaymentAttemptRepository,
  PoolFinancialsRepository,
  PtcFreezeRepository,
  SpvPaymentVerificationRepository,
} from '../repositories';
import {SpvPaymentVerificationService} from './spv-payment-verification.service';
import {UnitReservation} from './ptc-issuance.service';

export type CreateOrderDto = {
  spvId: string;
  requestedUnits: number;
  investmentAmount: number;
  faceValuePerUnit?: number;
  idempotencyKey?: string;
};

export type CreateOrderResult = {
  order: InvestmentOrder;
  verificationId: string;
  referenceId: string;
  paymentDeadlineAt: Date | undefined;
};

export type EscalateOrderDto = {
  escalationType?: EscalationType;
  reason: string;
  description: string;
  attachmentUrl?: string;
};

export type OrderFlowState = {
  orderId: string;
  status: InvestmentOrderStatus;
  verificationId: string | undefined;
  verificationStatus: SpvPaymentVerificationStatus | undefined;
  freezeExpiresAt: Date | undefined;
  paymentDeadlineAt: Date | undefined;
  allocatedUnits: number | undefined;
  allocatedAt: Date | undefined;
  cancellationReason: string | undefined;
  utrNumber: string | undefined;
  currentStep: number;
};

const PAYMENT_DEADLINE_MINUTES = 10;

export class InvestmentOrderService {
  constructor(
    @repository(InvestmentOrderRepository)
    private investmentOrderRepository: InvestmentOrderRepository,

    @repository(PtcFreezeRepository)
    private ptcFreezeRepository: PtcFreezeRepository,

    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,

    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,

    @repository(SpvPaymentVerificationRepository)
    private spvPaymentVerificationRepository: SpvPaymentVerificationRepository,

    @inject('service.spvPaymentVerification.service')
    private spvPaymentVerificationService: SpvPaymentVerificationService,

    @repository(EscalationRepository)
    private escalationRepository: EscalationRepository,

    @repository(PaymentAttemptRepository)
    private paymentAttemptRepository: PaymentAttemptRepository,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async createOrder(
    currentUser: UserProfile,
    dto: CreateOrderDto,
  ): Promise<CreateOrderResult> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);

    // Idempotency: return existing active order for the same key
    if (dto.idempotencyKey) {
      const existing = await this.investmentOrderRepository.findOne({
        where: {
          idempotencyKey: dto.idempotencyKey,
          investorProfileId,
          isDeleted: false,
        },
      });
      if (existing && existing.status !== InvestmentOrderStatus.CANCELLED) {
        let existingRefId = '';
        try {
          const v = await this.spvPaymentVerificationRepository.findById(existing.verificationId!);
          existingRefId = v.referenceId;
        } catch { /* non-critical */ }
        return {
          order: existing,
          verificationId: existing.verificationId!,
          referenceId: existingRefId,
          paymentDeadlineAt: existing.paymentDeadlineAt,
        };
      }
    }

    // Resolve face value per unit from pool financials if not provided
    let faceValuePerUnit = dto.faceValuePerUnit;
    if (!faceValuePerUnit) {
      const poolFinancials = await this.poolFinancialsRepository.findOne({
        where: {spvId: dto.spvId, isActive: true, isDeleted: false},
      });
      if (poolFinancials) {
        faceValuePerUnit = poolFinancials.poolLimit / 1; // face value from PTC parameters would be more accurate, but pool limit gives context
      }
    }

    // Create the SpvPaymentVerification (PENDING) first
    const verification = await this.spvPaymentVerificationService.createPaymentIntent(
      currentUser,
      dto.spvId,
      dto.requestedUnits,
      dto.investmentAmount,
    );

    // Set payment deadline
    const paymentDeadlineAt = new Date(
      Date.now() + PAYMENT_DEADLINE_MINUTES * 60 * 1000,
    );

    // Create the InvestmentOrder
    const order = await this.investmentOrderRepository.create({
      id: uuidv4(),
      investorProfileId,
      spvId: dto.spvId,
      requestedUnits: dto.requestedUnits,
      investmentAmount: dto.investmentAmount,
      faceValuePerUnit,
      status: InvestmentOrderStatus.PAYMENT_PENDING,
      verificationId: verification.id,
      idempotencyKey: dto.idempotencyKey,
      paymentDeadlineAt,
      isActive: true,
      isDeleted: false,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    });

    // Link the verification back to the order so both sides of the FK are populated
    await this.spvPaymentVerificationRepository.updateById(verification.id, {
      orderId: order.id,
    });

    return {
      order,
      verificationId: verification.id,
      referenceId: verification.referenceId,
      paymentDeadlineAt: order.paymentDeadlineAt,
    };
  }

  async submitUtr(
    currentUser: UserProfile,
    orderId: string,
    utrNumber: string,
    screenshotUrl?: string,
  ): Promise<InvestmentOrder & {utrNumber: string}> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    const order = await this.findOrderForInvestor(orderId, investorProfileId);

    if (order.status !== InvestmentOrderStatus.PAYMENT_PENDING) {
      throw new HttpErrors.BadRequest(
        `Order must be in PAYMENT_PENDING status to submit UTR (current: ${order.status})`,
      );
    }

    // Reject immediately when the payment window has closed, even if the cron has not
    // yet run. This keeps the backend in sync with the frontend countdown timer and the
    // PaymentWindowTimeoutCron, all of which use paymentDeadlineAt as the single source of truth.
    if (order.paymentDeadlineAt && new Date(order.paymentDeadlineAt) <= new Date()) {
      throw new HttpErrors.BadRequest(
        'Payment window has expired. Please create a new order to invest.',
      );
    }

    if (!order.verificationId) {
      throw new HttpErrors.UnprocessableEntity(
        'Order has no linked payment verification. Please contact support.',
      );
    }

    // Delegate to SpvPaymentVerificationService — handles PTC reservation + duplicate UTR guard
    const verification = await this.spvPaymentVerificationService.submitUtr(
      currentUser,
      order.verificationId,
      utrNumber,
      screenshotUrl,
    );

    // Extract reservation details from metadata to create PtcFreeze audit records
    const meta = verification.metadata as {reservation?: UnitReservation[]} | undefined;
    const reservations: UnitReservation[] = meta?.reservation ?? [];

    if (reservations.length > 0 && verification.reservationExpiresAt) {
      await this.createPtcFreezeRecords(
        order,
        investorProfileId,
        verification.id,
        reservations,
        new Date(verification.reservationExpiresAt),
        currentUser.id,
      );
    }

    const utrSubmittedAt = new Date();
    const freezeExpiresAt = verification.reservationExpiresAt
      ? new Date(verification.reservationExpiresAt)
      : undefined;

    await this.investmentOrderRepository.updateById(orderId, {
      status: InvestmentOrderStatus.UTR_SUBMITTED,
      utrSubmittedAt,
      freezeExpiresAt,
      // Mirror window / allocation date from the verification so both records agree
      submittedInWindow: verification.submittedInWindow ?? true,
      allocationDate: verification.allocationDate,
      updatedBy: currentUser.id,
    });

    // Count prior attempts so attemptNumber increments correctly on resubmission
    const priorCount = await this.paymentAttemptRepository.count({
      orderId,
    });

    await this.paymentAttemptRepository.create(
      new PaymentAttempt({
        id: uuidv4(),
        orderId,
        verificationId: order.verificationId ?? undefined,
        investorProfileId,
        utrNumber,
        screenshotUrl,
        amountClaimed: order.investmentAmount ? Number(order.investmentAmount) : undefined,
        attemptNumber: priorCount.count + 1,
        status: PaymentAttemptStatus.PENDING,
        submittedAt: utrSubmittedAt,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      }),
    );

    const updatedOrder = await this.investmentOrderRepository.findById(orderId);
    return Object.assign(updatedOrder, {utrNumber}) as InvestmentOrder & {utrNumber: string};
  }

  async cancelOrder(
    currentUser: UserProfile,
    orderId: string,
    reason?: string,
  ): Promise<InvestmentOrder> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    const order = await this.findOrderForInvestor(orderId, investorProfileId);

    const cancellableStatuses: InvestmentOrderStatus[] = [
      InvestmentOrderStatus.CREATED,
      InvestmentOrderStatus.AGREEMENT_SIGNED,
      InvestmentOrderStatus.PAYMENT_PENDING,
      InvestmentOrderStatus.UTR_SUBMITTED,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw new HttpErrors.BadRequest(
        `Order in status ${order.status} cannot be cancelled by the investor.`,
      );
    }

    // Release any active PTC freezes for this order
    await this.releaseOrderFreezes(orderId, PtcFreezeReleaseReason.CANCELLED, currentUser.id);

    await this.investmentOrderRepository.updateById(orderId, {
      status: InvestmentOrderStatus.CANCELLED,
      resolvedAt: new Date(),
      cancellationReason: reason ?? 'Cancelled by investor',
      isActive: false,
      updatedBy: currentUser.id,
    });

    return this.investmentOrderRepository.findById(orderId);
  }

  async getOrder(currentUser: UserProfile, orderId: string): Promise<InvestmentOrder> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    return this.findOrderForInvestor(orderId, investorProfileId);
  }

  async getInvestorOrders(
    currentUser: UserProfile,
    spvId?: string,
  ): Promise<InvestmentOrder[]> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    const where: Record<string, unknown> = {investorProfileId, isDeleted: false};
    if (spvId) where.spvId = spvId;
    return this.investmentOrderRepository.find({where, order: ['createdAt DESC']});
  }

  async getFlowState(
    currentUser: UserProfile,
    orderId: string,
  ): Promise<OrderFlowState> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    const order = await this.findOrderForInvestor(orderId, investorProfileId);

    let verificationStatus: SpvPaymentVerificationStatus | undefined;
    let freezeExpiresAt: Date | undefined;
    let utrNumber: string | undefined;

    if (order.verificationId) {
      const verification = await this.spvPaymentVerificationRepository.findById(
        order.verificationId,
      );
      verificationStatus = verification.status;
      utrNumber = verification.utrNumber;
      if (verification.freezeExpiresAt) {
        freezeExpiresAt = new Date(verification.freezeExpiresAt);
      }
    }

    return {
      orderId: order.id,
      status: order.status,
      verificationId: order.verificationId,
      verificationStatus,
      freezeExpiresAt,
      paymentDeadlineAt: order.paymentDeadlineAt,
      allocatedUnits: order.allocatedUnits,
      allocatedAt: order.allocatedAt,
      cancellationReason: order.cancellationReason,
      utrNumber,
      currentStep: this.mapStatusToStep(order.status, verificationStatus),
    };
  }

  async escalateOrder(
    currentUser: UserProfile,
    orderId: string,
    dto: EscalateOrderDto,
  ): Promise<Escalation> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    const order = await this.findOrderForInvestor(orderId, investorProfileId);

    const escalatableStatuses: InvestmentOrderStatus[] = [
      InvestmentOrderStatus.UTR_SUBMITTED,
      InvestmentOrderStatus.PAYMENT_UNDER_REVIEW,
      InvestmentOrderStatus.PAYMENT_FAILED,
      InvestmentOrderStatus.PTC_FREEZE_EXPIRED,
      InvestmentOrderStatus.PAYMENT_TIMEOUT,
    ];
    if (!escalatableStatuses.includes(order.status)) {
      throw new HttpErrors.BadRequest(
        `Order in status ${order.status} cannot be escalated.`,
      );
    }

    let utrNumber: string | undefined;
    if (order.verificationId) {
      try {
        const verification = await this.spvPaymentVerificationRepository.findById(
          order.verificationId,
        );
        utrNumber = verification.utrNumber;
      } catch {
        // non-critical
      }
    }

    return this.escalationRepository.create({
      id: uuidv4(),
      orderId,
      verificationId: order.verificationId,
      investorProfileId,
      spvId: order.spvId,
      escalationType: dto.escalationType ?? EscalationType.PAYMENT_DISPUTE,
      utrNumber,
      reason: dto.reason,
      description: dto.description,
      attachmentUrl: dto.attachmentUrl,
      status: EscalationStatus.OPEN,
      slaDeadlineAt: this.computeSlaDeadline(new Date(), 2),
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    } as DataObject<Escalation>);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async resolveInvestorProfileId(userId: string): Promise<string> {
    const profile = await this.investorProfileRepository.findOne({
      where: {usersId: userId, isDeleted: false},
    });
    if (!profile) {
      throw new HttpErrors.NotFound('Investor profile not found');
    }
    return profile.id;
  }

  private async findOrderForInvestor(
    orderId: string,
    investorProfileId: string,
  ): Promise<InvestmentOrder> {
    const order = await this.investmentOrderRepository.findById(orderId);
    if (order.investorProfileId !== investorProfileId) {
      throw new HttpErrors.Forbidden('Not authorized to access this order');
    }
    return order;
  }

  private async createPtcFreezeRecords(
    order: InvestmentOrder,
    investorProfileId: string,
    verificationId: string,
    reservations: UnitReservation[],
    expiresAt: Date,
    userId: string,
  ): Promise<void> {
    const freezes: DataObject<PtcFreeze>[] = reservations.map(r => ({
      id: uuidv4(),
      orderId: order.id,
      verificationId,
      investorProfileId,
      spvId: order.spvId,
      ptcIssuanceId: r.ptcIssuanceId,
      frozenUnits: r.reservedUnits,
      freezeReason: PtcFreezeReason.UTR_SUBMITTED,
      status: PtcFreezeStatus.ACTIVE,
      expiresAt,
      createdBy: userId,
      updatedBy: userId,
    }));

    await Promise.all(
      freezes.map(f => this.ptcFreezeRepository.create(f)),
    );
  }

  private async releaseOrderFreezes(
    orderId: string,
    releaseReason: PtcFreezeReleaseReason,
    userId: string,
  ): Promise<void> {
    const activeFreezes = await this.ptcFreezeRepository.find({
      where: {orderId, status: PtcFreezeStatus.ACTIVE},
    });

    if (activeFreezes.length === 0) return;

    await Promise.all(
      activeFreezes.map(f =>
        this.ptcFreezeRepository.updateById(f.id, {
          status: PtcFreezeStatus.RELEASED,
          releasedAt: new Date(),
          releaseReason,
          updatedBy: userId,
        }),
      ),
    );
  }

  private mapStatusToStep(
    orderStatus: InvestmentOrderStatus,
    verificationStatus?: SpvPaymentVerificationStatus,
  ): number {
    switch (orderStatus) {
      case InvestmentOrderStatus.CREATED:
      case InvestmentOrderStatus.AGREEMENT_SIGNED:
        return 1;
      case InvestmentOrderStatus.PAYMENT_PENDING:
        return 2;
      case InvestmentOrderStatus.UTR_SUBMITTED:
      case InvestmentOrderStatus.PAYMENT_UNDER_REVIEW:
        return verificationStatus === SpvPaymentVerificationStatus.ALLOCATED ? 5 : 4;
      case InvestmentOrderStatus.PAYMENT_SUCCESS:
        return 5;
      case InvestmentOrderStatus.PAYMENT_FAILED:
      case InvestmentOrderStatus.PAYMENT_TIMEOUT:
      case InvestmentOrderStatus.PTC_FREEZE_EXPIRED:
      case InvestmentOrderStatus.CANCELLED:
        return 1;
      default:
        return 1;
    }
  }

  // Adds businessDays working days to from, skipping weekends
  private computeSlaDeadline(from: Date, businessDays: number): Date {
    const result = new Date(from);
    let added = 0;
    while (added < businessDays) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    return result;
  }
}
