import {IsolationLevel, juggler, repository} from '@loopback/repository';
import cron, {ScheduledTask} from 'node-cron';
import {InvestmentOrderStatus, SpvPaymentVerificationStatus} from '../models';
import {
  InvestmentOrderRepository,
  SpvPaymentVerificationRepository,
} from '../repositories';

// Runs every 5 minutes — finds PAYMENT_PENDING orders past their deadline
const PAYMENT_TIMEOUT_CRON_SCHEDULE = '*/5 * * * *';

export class PaymentWindowTimeoutCron {
  private job?: ScheduledTask;

  constructor(
    @repository(InvestmentOrderRepository)
    private investmentOrderRepository: InvestmentOrderRepository,

    @repository(SpvPaymentVerificationRepository)
    private spvPaymentVerificationRepository: SpvPaymentVerificationRepository,
  ) {}

  start() {
    if (this.job) return;

    this.job = cron.schedule(PAYMENT_TIMEOUT_CRON_SCHEDULE, async () => {
      await this.expireTimedOutOrders();
    });
  }

  stop() {
    const stopResult = this.job?.stop();
    if (stopResult instanceof Promise) {
      stopResult.catch(() => undefined);
    }
    this.job = undefined;
  }

  private async expireTimedOutOrders(): Promise<void> {
    const now = new Date();

    // Candidate scan — plain read, no lock; only fetches IDs to minimise result-set size.
    // The authoritative check happens inside expireOrderSafely under a row-level lock.
    const candidates = await this.investmentOrderRepository.find({
      where: {
        and: [
          {status: InvestmentOrderStatus.PAYMENT_PENDING},
          {paymentDeadlineAt: {lte: now}},
          {isDeleted: false},
        ],
      },
      fields: {id: true},
    });

    if (!candidates.length) return;

    for (const candidate of candidates) {
      await this.expireOrderSafely(candidate.id, now);
    }
  }

  // Wraps the expiry of a single order in a READ_COMMITTED transaction with
  // FOR UPDATE SKIP LOCKED so that:
  //  - Two cron workers running simultaneously never double-expire the same order
  //  - A concurrent investor action (cancel, UTR submit) holding a plain FOR UPDATE
  //    causes this worker to skip the row cleanly rather than block or deadlock
  //  - An order already transitioned out of PAYMENT_PENDING is excluded by the
  //    WHERE predicate inside the lock attempt, so the cron never double-fires
  private async expireOrderSafely(orderId: string, now: Date): Promise<void> {
    const ds = (this.investmentOrderRepository as unknown as {dataSource: juggler.DataSource}).dataSource;
    const tx = await ds.beginTransaction(IsolationLevel.READ_COMMITTED);

    try {
      // Attempt to claim this row exclusively. SKIP LOCKED means: if another session
      // already holds a lock (concurrent cron pod or admin action), return 0 rows and
      // move on rather than blocking.
      const locked = await ds.execute(
        `SELECT id FROM investment_orders
         WHERE id = $1
           AND status = 'PAYMENT_PENDING'
           AND paymentdeadlineat <= $2
           AND isdeleted = false
         FOR UPDATE SKIP LOCKED`,
        [orderId, now],
        {transaction: tx},
      ) as Array<{id: string}>;

      if (!locked.length) {
        // Row is locked by another worker, or the status already transitioned — skip.
        await tx.commit();
        return;
      }

      // We hold the exclusive row lock — read authoritative state within this transaction.
      const order = await this.investmentOrderRepository.findById(
        orderId, undefined, {transaction: tx},
      );

      // Double-check after lock acquisition: the candidate scan may be stale.
      if (
        order.status !== InvestmentOrderStatus.PAYMENT_PENDING ||
        !order.paymentDeadlineAt ||
        new Date(order.paymentDeadlineAt) > now
      ) {
        await tx.commit();
        return;
      }

      await this.investmentOrderRepository.updateById(
        orderId,
        {
          status: InvestmentOrderStatus.PAYMENT_TIMEOUT,
          resolvedAt: now,
          isActive: false,
          updatedBy: 'system',
        },
        {transaction: tx},
      );

      await tx.commit();

      // Post-commit side-effects — run outside the transaction to avoid blocking on
      // any concurrent lock held by an in-flight investor action on the verification row.
      // The conditional updateAll is idempotent: only fires when status is still PENDING.
      if (order.verificationId) {
        await this.expireLinkedVerification(order.verificationId);
      }
    } catch (error) {
      await tx.rollback();
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[PaymentWindowTimeoutCron] Failed to expire order ${orderId}: ${message}`,
      );
    }
  }

  // Conditionally expires the linked verification only if it is still PENDING.
  // Uses updateAll with a WHERE predicate for idempotent, non-blocking expiry.
  // Called post-commit so a concurrent investor UTR-submission lock never blocks the cron.
  private async expireLinkedVerification(verificationId: string): Promise<void> {
    try {
      await this.spvPaymentVerificationRepository.updateAll(
        {status: SpvPaymentVerificationStatus.EXPIRED, updatedBy: 'system'},
        {
          and: [
            {id: verificationId},
            {status: SpvPaymentVerificationStatus.PENDING},
          ],
        },
      );
    } catch {
      // Non-critical: verification expiry is best-effort after the order is already expired
    }
  }
}
