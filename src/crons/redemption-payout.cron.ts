import {inject} from '@loopback/core';
import {CronJob, cronJob} from '@loopback/cron';
import {RedemptionPayoutService} from '../services/redemption-payout.service';

/**
 * RedemptionPayoutCron — runs every 5 minutes.
 *
 * Three-phase pipeline (all phases use FOR UPDATE SKIP LOCKED):
 *   1. promoteReadyPayouts   — advance REQUESTED/PENDING_SETTLEMENT → READY_FOR_PAYOUT
 *                             once expectedPayoutDate is reached
 *   2. dispatchPendingTransfers — process READY_FOR_PAYOUT → PAYOUT_PROCESSING → PAID
 *   3. retryFailedPayouts    — re-queue RETRY_PENDING payouts under the retry cap
 *
 * Safe for horizontal scaling: SKIP LOCKED prevents two instances from
 * processing the same row simultaneously.
 */
@cronJob()
export class RedemptionPayoutCron extends CronJob {
  constructor(
    @inject('service.redemptionPayout.service')
    private redemptionPayoutService: RedemptionPayoutService,
  ) {
    super({
      name: 'redemption-payout-cron',
      onTick: async () => {
        await this.execute();
      },
      cronTime: '*/5 * * * *',
      start: false,
      runOnInit: false,
    });
  }

  async execute(): Promise<void> {
    console.log(`[RedemptionPayoutCron] tick at ${new Date().toISOString()}`);

    try {
      await this.redemptionPayoutService.promoteReadyPayouts();
    } catch (err) {
      console.error('[RedemptionPayoutCron] promoteReadyPayouts failed', err);
    }

    try {
      await this.redemptionPayoutService.dispatchPendingTransfers();
    } catch (err) {
      console.error('[RedemptionPayoutCron] dispatchPendingTransfers failed', err);
    }

    try {
      await this.redemptionPayoutService.retryFailedPayouts();
    } catch (err) {
      console.error('[RedemptionPayoutCron] retryFailedPayouts failed', err);
    }
  }
}
