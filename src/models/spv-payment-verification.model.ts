import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';
import {Spv} from './spv.model';

export enum SpvPaymentVerificationStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  VERIFIED = 'VERIFIED',
  AUTO_VERIFIED = 'AUTO_VERIFIED',
  ALLOCATED = 'ALLOCATED',
  REJECTED = 'REJECTED',
  REVERSED = 'REVERSED',
  SUSPICIOUS = 'SUSPICIOUS',
  EXPIRED = 'EXPIRED',
  TIME_EXCEEDED = 'TIME_EXCEEDED',
}

// ----------------------------------------------------------------------

@model({
  settings: {
    postgresql: {
      table: 'spv_payment_verifications',
      schema: 'public',
    },
  },
})
export class SpvPaymentVerification extends Entity {
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
    postgresql: {dataType: 'uuid'},
  })
  transactionId?: string;

  @property({
    type: 'string',
    required: true,
  })
  referenceId: string;

  @property({type: 'string'})
  utrNumber?: string;

  @property({type: 'string'})
  screenshotUrl?: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  amount: number;

  @property({
    type: 'number',
    postgresql: {dataType: 'numeric', precision: 20, scale: 2},
  })
  verifiedAmount?: number;

  @property({
    type: 'number',
    required: true,
    default: 1,
  })
  units: number;

  @property({type: 'number'})
  allocatedUnits?: number;

  @property({
    type: 'string',
    required: true,
    default: SpvPaymentVerificationStatus.PENDING,
    jsonSchema: {enum: Object.values(SpvPaymentVerificationStatus)},
  })
  status: SpvPaymentVerificationStatus;

  @property({
    type: 'number',
    default: 0,
    jsonSchema: {enum: [0, 1, 2]},
    description: '0 for pending, 1 for approved, 2 for rejected',
  })
  verificationStatus: number;

  @property({type: 'string'})
  verifiedBy?: string;

  @property({type: 'date'})
  verifiedAt?: Date;

  @property({type: 'date'})
  allocatedAt?: Date;

  @property({type: 'string'})
  rejectionReason?: string;

  @property({type: 'string'})
  idempotencyKey?: string;

  @property({type: 'string'})
  suspiciousReason?: string;

  @property({type: 'number'})
  reservedUnits?: number;

  @property({type: 'date'})
  unitsReservedAt?: Date;

  @property({type: 'date'})
  reservationExpiresAt?: Date;

  @property({type: 'string'})
  reservationStatus?: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  orderId?: string;

  @property({type: 'date'})
  freezeExpiresAt?: Date;

  @property({type: 'boolean', default: true})
  submittedInWindow?: boolean;

  @property({type: 'date'})
  allocationDate?: Date;

  @property({type: 'object'})
  metadata?: object;

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

  constructor(data?: Partial<SpvPaymentVerification>) {
    super(data);
  }
}

export interface SpvPaymentVerificationRelations {}

export type SpvPaymentVerificationWithRelations = SpvPaymentVerification &
  SpvPaymentVerificationRelations;
