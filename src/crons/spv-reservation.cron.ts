import {inject} from '@loopback/core';
import {IsolationLevel, juggler, repository} from '@loopback/repository';
import cron, {ScheduledTask} from 'node-cron';
import {
  InvestmentOrderStatus,
  PtcFreezeReleaseReason,
  PtcFreezeStatus,
  SpvPaymentVerification,
  SpvPaymentVerificationStatus,
} from '../models';
import {
  InvestmentOrderRepository,
  PtcFreezeRepository,
  SpvPaymentVerificationRepository,
} from '../repositories';
import {PtcIssuanceService, UnitReservation} from '../services/ptc-issuance.service';

const SPV_RESERVATION_CRON_SCHEDULE = '*/2 * * * *';

export class SpvReservationCron {
  private job?: ScheduledTask;

  constructor(
    @repository(SpvPaymentVerificationRepository)
    private spvPaymentVerificationRepository: SpvPaymentVerificationRepository,

    @inject('service.ptcIssuance.service')
    private ptcIssuanceService: PtcIssuanceService,

    @repository(InvestmentOrderRepository)
    private investmentOrderRepository: InvestmentOrderRepository,

    @repository(PtcFreezeRepository)
    private ptcFreezeRepository: PtcFreezeRepository,
  ) {}

  start() {
    if (this.job) {
      return;
    }

    console.log(
      `[SpvReservationCron] Scheduling with expression "${SPV_RESERVATION_CRON_SCHEDULE}"`,
    );

    this.job = cron.schedule(SPV_RESERVATION_CRON_SCHEDULE, async () => {
      await this.releaseExpiredReservations();
    });
  }

  stop() {
    const stopResult = this.job?.stop();

    if (stopResult instanceof Promise) {
      stopResult.catch(() => undefined);
    }

    this.job = undefined;
  }

  private async releaseExpiredReservations(): Promise<void> {
    const now = new Date();

    // Fetch candidates without a lock — just collect IDs for the per-row safe processor
    const candidates = await this.spvPaymentVerificationRepository.find({
      where: {
        and: [
          {status: SpvPaymentVerificationStatus.SUBMITTED},
          {reservationStatus: 'RESERVED'},
          {reservationExpiresAt: {lte: now}},
          {isDeleted: false},
        ],
      },
      fields: {id: true},
    });

    if (!candidates.length) {
      return;
    }

    console.log(
      `[SpvReservationCron] Found ${candidates.length} expired reservation candidate(s)`,
    );

    for (const candidate of candidates) {
      await this.processExpiredVerificationSafely(candidate.id, now);
    }
  }

  // Wraps the expiry of a single verification in a READ_COMMITTED transaction with
  // FOR UPDATE SKIP LOCKED so that:
  //  - Two cron workers running simultaneously never double-release the same reservation
  //  - An admin rejection holding a plain FOR UPDATE lock causes this worker to skip the row
  //    and leave it for the rejection to handle
  //  - An approval in-flight (reservationStatus already set to CONSUMING) is excluded by the
  //    reservationstatus = 'RESERVED' predicate, so the cron never races with approval
  private async processExpiredVerificationSafely(
    verificationId: string,
    now: Date,
  ): Promise<void> {
    const ds = (this.spvPaymentVerificationRepository as unknown as {dataSource: juggler.DataSource}).dataSource;
    const tx = await ds.beginTransaction(IsolationLevel.READ_COMMITTED);

    try {
      // Try to claim this row. SKIP LOCKED means: if another session holds the lock (another
      // cron worker or an admin reject transaction), return 0 rows and move on rather than waiting.
      const locked = await ds.execute(
        `SELECT id FROM spv_payment_verifications
         WHERE id = $1 AND reservationstatus = 'RESERVED'
         FOR UPDATE SKIP LOCKED`,
        [verificationId],
        {transaction: tx},
      ) as Array<{id: string}>;

      if (!locked.length) {
        // Either locked by another worker or already transitioned out of RESERVED — skip
        await tx.commit();
        return;
      }

      // We hold the exclusive lock — read authoritative state
      const verification = await this.spvPaymentVerificationRepository.findById(
        verificationId, undefined, {transaction: tx},
      );

      // Double-check: conditions may have changed between candidate scan and lock acquisition
      if (
        verification.status !== SpvPaymentVerificationStatus.SUBMITTED ||
        verification.reservationStatus !== 'RESERVED'
      ) {
        await tx.commit();
        return;
      }

      const meta = (verification.metadata ?? {}) as Record<string, unknown>;
      const reservations = (meta.reservation as UnitReservation[] | undefined) ?? [];

      if (reservations.length > 0) {
        // Release within the same tx — rolls back atomically with status update if it fails
        await this.ptcIssuanceService.releaseUnitsReservation(
          reservations,
          `reservation expired for verification ${verificationId}`,
          tx,
        );
      }

      await this.spvPaymentVerificationRepository.updateById(verification.id, {
        status: SpvPaymentVerificationStatus.EXPIRED,
        reservationStatus: 'RELEASED',
        updatedBy: 'system',
      }, {transaction: tx});

      await tx.commit();

      // Post-commit side-effects — these are non-critical and can run outside the tx
      await this.expirePtcFreezes(verificationId, now);
      await this.expireLinkedOrder(verificationId, now);

      console.log(
        `[SpvReservationCron] Released reservation and expired verification ${verificationId}`,
      );
    } catch (error) {
      await tx.rollback();
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[SpvReservationCron] Failed to expire verification ${verificationId}: ${message}`,
      );
    }
  }

  private async expirePtcFreezes(verificationId: string, now: Date): Promise<void> {
    const activeFreezes = await this.ptcFreezeRepository.find({
      where: {
        verificationId,
        status: PtcFreezeStatus.ACTIVE,
      },
    });

    if (!activeFreezes.length) return;

    await Promise.all(
      activeFreezes.map(f =>
        this.ptcFreezeRepository.updateById(f.id, {
          status: PtcFreezeStatus.EXPIRED,
          releasedAt: now,
          releaseReason: PtcFreezeReleaseReason.EXPIRED,
          updatedBy: 'system',
        }),
      ),
    );
  }

  private async expireLinkedOrder(verificationId: string, now: Date): Promise<void> {
    const order = await this.investmentOrderRepository.findOne({
      where: {
        verificationId,
        status: InvestmentOrderStatus.UTR_SUBMITTED,
        isDeleted: false,
      },
    });

    if (!order) return;

    await this.investmentOrderRepository.updateById(order.id, {
      status: InvestmentOrderStatus.PTC_FREEZE_EXPIRED,
      resolvedAt: now,
      isActive: false,
      updatedBy: 'system',
    });

    console.log(
      `[SpvReservationCron] Marked order ${order.id} as PTC_FREEZE_EXPIRED`,
    );
  }
}
