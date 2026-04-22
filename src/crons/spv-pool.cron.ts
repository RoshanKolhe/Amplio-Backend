import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import cron, {ScheduledTask} from 'node-cron';
import {SpvRepository} from '../repositories';
import {EscrowService} from '../services/escrow.service';
import {PoolService} from '../services/pool.service';

const SPV_POOL_CRON_SCHEDULE = '*/5 * * * *';

export class SpvPoolCron {
  private job?: ScheduledTask;

  constructor(
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @inject('service.escrow.service')
    private escrowService: EscrowService,
    @inject('service.pool.service')
    private poolService: PoolService,
  ) {}

  start() {
    if (this.job) {
      return;
    }

    console.log(
      `[SpvPoolCron] Scheduling SPV pool cron with expression "${SPV_POOL_CRON_SCHEDULE}"`,
    );

    this.job = cron.schedule(SPV_POOL_CRON_SCHEDULE, async () => {
      const startedAt = new Date();
      console.log(`[SpvPoolCron] Tick started at ${startedAt.toISOString()}`);

      const spvs = await this.spvRepository.find({
        where: {
          and: [{isActive: true}, {isDeleted: false}],
        },
        fields: {id: true, spvName: true},
      });

      for (const spv of spvs) {
        try {
          const escrowResult = await this.escrowService.reconcileSpvEscrow(spv.id);
          const poolResult = await this.poolService.syncSpvPool(spv.id);

          console.log('[SpvPoolCron] SPV sync completed', {
            spvId: spv.id,
            spvName: spv.spvName,
            escrowProcessed: escrowResult.processed,
            escrowMatched: escrowResult.matched,
            poolOutstanding: poolResult.pool.outstanding,
            fundeedAdded: poolResult.fundedSync.addedCount,
            settledCount: poolResult.settledSync.settledCount,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[SpvPoolCron] Failed for SPV ${spv.id}: ${message}`);
        }
      }

      console.log(`[SpvPoolCron] Tick finished at ${new Date().toISOString()}`);
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
