import {inject} from '@loopback/core';
import cron, {ScheduledTask} from 'node-cron';
import {MerchantPayoutExecutorService} from '../services/merchant-payout-executor.service';
import {MerchantPayoutService} from '../services/merchant-payout.service';

const MERCHANT_PAYOUT_CRON_SCHEDULE = '*/1 * * * *';
const MERCHANT_PAYOUT_LOOKBACK_DAYS = 2;

export class MerchantPayoutCron {
  private job?: ScheduledTask;

  constructor(
    @inject('service.merchantPayoutService.service')
    private merchantPayoutService: MerchantPayoutService,
    @inject('service.merchantPayoutExecutorService.service')
    private merchantPayoutExecutorService: MerchantPayoutExecutorService,
  ) {}

  start() {
    if (this.job) {
      return;
    }

    console.log(
      `[MerchantPayoutCron] Scheduling merchant payout cron with expression "${MERCHANT_PAYOUT_CRON_SCHEDULE}" and lookbackDays=${MERCHANT_PAYOUT_LOOKBACK_DAYS}`,
    );

    this.job = cron.schedule(MERCHANT_PAYOUT_CRON_SCHEDULE, async () => {
      const referenceAt = new Date();

      console.log(`[MerchantPayoutCron] Tick started at ${referenceAt.toISOString()}`);

      try {
        const preparedBatches = await this.merchantPayoutService.prepareDueBatches(
          referenceAt,
          MERCHANT_PAYOUT_LOOKBACK_DAYS,
        );
        const executedBatches =
          await this.merchantPayoutExecutorService.executePendingBatches(
            referenceAt,
          );

        console.log(
          `[MerchantPayoutCron] Tick finished at ${referenceAt.toISOString()} with ${preparedBatches.length} prepared payout batch(es) and ${executedBatches.length} executed payout batch(es)`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown merchant payout cron error';
        console.error(
          `[MerchantPayoutCron] Failed at ${referenceAt.toISOString()}: ${message}`,
        );
      }
    });
  }

  stop() {
    const stopResult = this.job?.stop();

    if (stopResult instanceof Promise) {
      stopResult.catch(() => undefined);
    }

    this.job = undefined;
  }
}
