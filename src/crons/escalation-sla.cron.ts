import {repository} from '@loopback/repository';
import cron, {ScheduledTask} from 'node-cron';
import {EscalationStatus} from '../models';
import {EscalationRepository} from '../repositories';

// Runs every 30 minutes
const ESCALATION_SLA_CRON_SCHEDULE = '*/30 * * * *';

// Alert when SLA deadline is within this many hours
const SLA_WARNING_HOURS = 2;

export class EscalationSlaCron {
  private job?: ScheduledTask;

  constructor(
    @repository(EscalationRepository)
    private escalationRepository: EscalationRepository,
  ) {}

  start() {
    if (this.job) return;

    console.log(
      `[EscalationSlaCron] Scheduling with expression "${ESCALATION_SLA_CRON_SCHEDULE}"`,
    );

    this.job = cron.schedule(ESCALATION_SLA_CRON_SCHEDULE, async () => {
      await this.checkSlaBreaches();
    });
  }

  stop() {
    const stopResult = this.job?.stop();
    if (stopResult instanceof Promise) {
      stopResult.catch(() => undefined);
    }
    this.job = undefined;
  }

  private async checkSlaBreaches(): Promise<void> {
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + SLA_WARNING_HOURS * 60 * 60 * 1000);

    const activeStatuses = [EscalationStatus.OPEN, EscalationStatus.UNDER_REVIEW];

    // Fetch all active escalations with an SLA deadline
    const escalations = await this.escalationRepository.find({
      where: {
        and: [
          {status: {inq: activeStatuses}},
          {slaDeadlineAt: {lte: warningCutoff}},
        ],
      },
    });

    if (!escalations.length) return;

    const breached = escalations.filter(
      e => e.slaDeadlineAt && new Date(e.slaDeadlineAt) <= now,
    );
    const approaching = escalations.filter(
      e => e.slaDeadlineAt && new Date(e.slaDeadlineAt) > now,
    );

    if (breached.length > 0) {
      console.error(
        `[EscalationSlaCron] SLA BREACHED for ${breached.length} escalation(s): ${breached.map(e => e.id).join(', ')}`,
      );
    }

    if (approaching.length > 0) {
      console.warn(
        `[EscalationSlaCron] SLA approaching (within ${SLA_WARNING_HOURS}h) for ${approaching.length} escalation(s): ${approaching.map(e => e.id).join(', ')}`,
      );
    }
  }
}
