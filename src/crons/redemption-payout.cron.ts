import {inject} from '@loopback/core';
import cron, {ScheduledTask} from 'node-cron';
import {RedemptionPayoutService} from '../services/redemption-payout.service';

const REDEMPTION_PAYOUT_CRON_SCHEDULE = '*/5 * * * *';

export class RedemptionPayoutCron {
  private job?: ScheduledTask;

  constructor(
    @inject('service.redemptionPayout.service')
    private redemptionPayoutService: RedemptionPayoutService,
  ) {}

  start() {
    if (this.job) return;

    console.log(
      `[RedemptionPayoutCron] Scheduling with expression "${REDEMPTION_PAYOUT_CRON_SCHEDULE}"`,
    );

    this.job = cron.schedule(REDEMPTION_PAYOUT_CRON_SCHEDULE, async () => {
      await this.execute();
    });
  }

  stop() {
    const stopResult = this.job?.stop();
    if (stopResult instanceof Promise) {
      stopResult.catch(() => undefined);
    }
    this.job = undefined;
  }

  private async execute(): Promise<void> {
    console.log(`[RedemptionPayoutCron] tick at ${new Date().toISOString()}`);

    try {
      await this.redemptionPayoutService.recoverStaleProcessingPayouts();
    } catch (err) {
      console.error('[RedemptionPayoutCron] recoverStaleProcessingPayouts failed', err);
    }

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
