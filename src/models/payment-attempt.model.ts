import {Entity, model, property} from '@loopback/repository';

export enum PaymentAttemptStatus {
  PENDING = 'PENDING',
  REVIEWING = 'REVIEWING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@model({
  settings: {
    postgresql: {
      table: 'spv_payment_',
      schema: 'public',
    },
  },
})
export class PaymentAttempt extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  orderId: string;

  // Linked SpvPaymentVerification at time of submission
  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  verificationId?: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  investorProfileId: string;

  @property({type: 'string', required: true})
  utrNumber: string;

  @property({type: 'string'})
  screenshotUrl?: string;

  // Amount the investor claims to have transferred
  @property({
    type: 'number',
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  amountClaimed?: number;

  // 1-based counter; increments each time investor resubmits on same order
  @property({type: 'number', default: 1})
  attemptNumber?: number;

  @property({
    type: 'string',
    required: true,
    default: PaymentAttemptStatus.PENDING,
    jsonSchema: {enum: Object.values(PaymentAttemptStatus)},
  })
  status: PaymentAttemptStatus;

  @property({type: 'date', defaultFn: 'now'})
  submittedAt?: Date;

  @property({type: 'date'})
  reviewedAt?: Date;

  @property({type: 'string'})
  reviewedBy?: string;

  @property({type: 'string'})
  rejectionReason?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: Date;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: Date;

  @property({type: 'string'})
  createdBy?: string;

  @property({type: 'string'})
  updatedBy?: string;

  constructor(data?: Partial<PaymentAttempt>) {
    super(data);
  }
}

export interface PaymentAttemptRelations {}

export type PaymentAttemptWithRelations = PaymentAttempt &
  PaymentAttemptRelations;
