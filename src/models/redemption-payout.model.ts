import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';
import {Spv} from './spv.model';

export enum RedemptionPayoutStatus {
  // ── Active lifecycle ──────────────────────────────────────────────────────
  REQUESTED = 'REQUESTED',               // units deducted, awaiting settlement window
  PENDING_SETTLEMENT = 'PENDING_SETTLEMENT', // settlement date not yet reached
  READY_FOR_PAYOUT = 'READY_FOR_PAYOUT', // settlement date reached, queued for transfer
  PAYOUT_PROCESSING = 'PAYOUT_PROCESSING', // cron picked up, transfer in flight
  PAID = 'PAID',                         // bank transfer confirmed
  RECONCILED = 'RECONCILED',             // matched against bank statement
  // ── Error paths ───────────────────────────────────────────────────────────
  FAILED = 'FAILED',                     // transfer failed terminally
  CANCELLED = 'CANCELLED',               // admin/system cancelled
  RETRY_PENDING = 'RETRY_PENDING',       // transient failure, queued for retry
  // ── Legacy compat (kept for existing records) ────────────────────────────
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  TRANSFERRED = 'TRANSFERRED',
}

@model({
  settings: {
    postgresql: {
      table: 'redemption_payouts',
      schema: 'public',
    },
  },
})
export class RedemptionPayout extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @belongsTo(() => InvestorProfile)
  investorProfileId: string;

  @belongsTo(() => Spv)
  spvId: string;

  @property({
    type: 'string',
    required: true,
  })
  transactionId: string;

  @property({type: 'string'})
  redemptionRequestId?: string;

  @property({
    type: 'number',
    required: true,
  })
  units: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  grossPayout: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  netPayout: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  principalPayout: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  interestPayout: number;

  @property({
    type: 'number',
    default: 0,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  capitalGain: number;

  @property({
    type: 'number',
    default: 0,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  stampDutyAmount: number;

  @property({
    type: 'number',
    default: 0,
    postgresql: {dataType: 'numeric', precision: 20, scale: 6},
  })
  stampDutyRate: number;

  @property({
    type: 'number',
    default: 0,
  })
  annualInterestRate: number;

  @property({
    type: 'string',
    required: true,
    default: RedemptionPayoutStatus.REQUESTED,
    jsonSchema: {enum: Object.values(RedemptionPayoutStatus)},
  })
  status: RedemptionPayoutStatus;

  // ── Settlement scheduling ─────────────────────────────────────────────────

  @property({type: 'date'})
  submittedAt?: Date;

  @property({
    type: 'boolean',
    default: false,
  })
  submittedAfterCutoff: boolean;

  /**
   * 1 if submitted before 5 PM IST (investor earns one extra day of interest),
   * 0 if submitted at or after 5 PM IST.
   */
  @property({
    type: 'number',
    default: 1,
  })
  extraInterestDays: number;

  /** Calendar date the payout is scheduled to be disbursed (IST date, stored as UTC midnight). */
  @property({type: 'date'})
  expectedPayoutDate?: Date;

  /** Actual date the bank transfer was confirmed. */
  @property({type: 'date'})
  settlementDate?: Date;

  // ── Bank account ──────────────────────────────────────────────────────────

  /** FK to bank_details.id — the primary account used for this payout. */
  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  bankAccountId?: string;

  /** Immutable snapshot of the bank account at the time of payout creation. */
  @property({type: 'object'})
  bankAccountSnapshot?: object;

  // ── Retry tracking ────────────────────────────────────────────────────────

  @property({
    type: 'number',
    default: 0,
  })
  retryCount: number;

  @property({type: 'date'})
  lastAttemptAt?: Date;

  /** Prevents duplicate payout records for the same redemption transaction. */
  @property({type: 'string'})
  idempotencyKey?: string;

  // ── Admin / audit ─────────────────────────────────────────────────────────

  @property({type: 'string'})
  processedBy?: string;

  @property({type: 'date'})
  processedAt?: Date;

  @property({type: 'string'})
  transferReference?: string;

  @property({type: 'string'})
  failureReason?: string;

  @property({type: 'object'})
  metadata?: object;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: Date;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: Date;

  @property({type: 'boolean', default: false})
  isDeleted?: boolean;

  @property({type: 'boolean', default: true})
  isActive?: boolean;

  @property({type: 'string'})
  createdBy?: string;

  @property({type: 'string'})
  updatedBy?: string;

  constructor(data?: Partial<RedemptionPayout>) {
    super(data);
  }
}

export interface RedemptionPayoutRelations {}

export type RedemptionPayoutWithRelations = RedemptionPayout &
  RedemptionPayoutRelations;
