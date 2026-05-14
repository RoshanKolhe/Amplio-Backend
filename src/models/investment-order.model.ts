import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';

export enum InvestmentOrderStatus {
  CREATED = 'CREATED',
  AGREEMENT_SIGNED = 'AGREEMENT_SIGNED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  UTR_SUBMITTED = 'UTR_SUBMITTED',
  PAYMENT_UNDER_REVIEW = 'PAYMENT_UNDER_REVIEW',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  PTC_FREEZE_EXPIRED = 'PTC_FREEZE_EXPIRED',
  CANCELLED = 'CANCELLED',
}

// Active statuses that block a new order for the same investor+SPV
export const ACTIVE_ORDER_STATUSES: InvestmentOrderStatus[] = [
  InvestmentOrderStatus.CREATED,
  InvestmentOrderStatus.AGREEMENT_SIGNED,
  InvestmentOrderStatus.PAYMENT_PENDING,
  InvestmentOrderStatus.UTR_SUBMITTED,
  InvestmentOrderStatus.PAYMENT_UNDER_REVIEW,
];

@model({
  settings: {
    postgresql: {
      table: 'investment_orders',
      schema: 'public',
    },
  },
})
export class InvestmentOrder extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @belongsTo(() => InvestorProfile)
  investorProfileId: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  spvId: string;

  @property({
    type: 'number',
    required: true,
  })
  requestedUnits: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  investmentAmount: number;

  @property({
    type: 'number',
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  faceValuePerUnit?: number;

  @property({
    type: 'string',
    required: true,
    default: InvestmentOrderStatus.CREATED,
    jsonSchema: {enum: Object.values(InvestmentOrderStatus)},
  })
  status: InvestmentOrderStatus;

  // Linked SpvPaymentVerification created on agreement sign
  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  verificationId?: string;

  // Linked Transaction after allocation
  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  transactionId?: string;

  // Timestamps for the order lifecycle
  @property({type: 'date'})
  agreementSignedAt?: Date;

  // agreementSignedAt + 10 minutes; enforced by PaymentWindowTimeoutCron
  @property({type: 'date'})
  paymentDeadlineAt?: Date;

  @property({type: 'date'})
  utrSubmittedAt?: Date;

  // utrSubmittedAt + 30 minutes; enforced by enhanced SpvReservationCron
  @property({type: 'date'})
  freezeExpiresAt?: Date;

  @property({type: 'date'})
  resolvedAt?: Date;

  // Allocation outcome
  @property({type: 'number'})
  allocatedUnits?: number;

  @property({type: 'date'})
  allocatedAt?: Date;

  @property({type: 'boolean', default: false})
  partialAllocation?: boolean;

  // Caller-supplied idempotency key for safe retries
  @property({type: 'string'})
  idempotencyKey?: string;

  // Extensible audit/metadata bag
  @property({type: 'object'})
  metadata?: object;

  @property({type: 'string'})
  cancellationReason?: string;

  // TRUE if UTR was submitted within the 9AM–3PM window
  @property({type: 'boolean', default: true})
  submittedInWindow?: boolean;

  // Effective allocation date: same-day or next business day
  @property({type: 'date'})
  allocationDate?: Date;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: Date;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: Date;

  @property({type: 'boolean', default: true})
  isActive?: boolean;

  @property({type: 'boolean', default: false})
  isDeleted?: boolean;

  @property({type: 'date'})
  deletedAt?: Date;

  @property({type: 'string'})
  createdBy?: string;

  @property({type: 'string'})
  updatedBy?: string;

  constructor(data?: Partial<InvestmentOrder>) {
    super(data);
  }
}

export interface InvestmentOrderRelations {}

export type InvestmentOrderWithRelations = InvestmentOrder &
  InvestmentOrderRelations;
