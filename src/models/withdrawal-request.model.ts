import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';

export enum WithdrawalRequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@model({
  settings: {
    postgresql: {
      table: 'withdrawal_request',
      schema: 'public',
    },
  },
})
export class WithdrawalRequest extends Entity {
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
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  amount: number;

  @property({
    type: 'string',
    required: true,
    default: WithdrawalRequestStatus.PENDING,
    jsonSchema: {
      enum: Object.values(WithdrawalRequestStatus),
    },
  })
  status: WithdrawalRequestStatus;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  requestedAt?: Date;

  @property({
    type: 'date',
  })
  processedAt?: Date;

  @property({
    type: 'string',
  })
  remarks?: string;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  createdAt?: Date;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  updatedAt?: Date;

  @property({
    type: 'boolean',
    default: false,
  })
  isDeleted?: boolean;

  constructor(data?: Partial<WithdrawalRequest>) {
    super(data);
  }
}

export interface WithdrawalRequestRelations {}

export type WithdrawalRequestWithRelations = WithdrawalRequest &
  WithdrawalRequestRelations;
