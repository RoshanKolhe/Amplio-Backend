import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';
import {Spv} from './spv.model';

export enum RedemptionPayoutStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  TRANSFERRED = 'TRANSFERRED',
  FAILED = 'FAILED',
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
    default: RedemptionPayoutStatus.PENDING,
    jsonSchema: {enum: Object.values(RedemptionPayoutStatus)},
  })
  status: RedemptionPayoutStatus;

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
