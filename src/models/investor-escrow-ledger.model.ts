import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorEscrowAccount} from './investor-escrow-account.model';
import {InvestorProfile} from './investor-profile.model';

export enum InvestorEscrowLedgerType {
  DEPOSIT = 'DEPOSIT',
  BUY_DEBIT = 'BUY_DEBIT',
  REDEMPTION_CREDIT = 'REDEMPTION_CREDIT',
  WITHDRAWAL_DEBIT = 'WITHDRAWAL_DEBIT',
}

export enum InvestorEscrowLedgerStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@model({
  settings: {
    postgresql: {
      table: 'investor_escrow_ledgers',
      schema: 'public',
    },
  },
})
export class InvestorEscrowLedger extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @belongsTo(() => InvestorEscrowAccount)
  investorEscrowAccountId: string;

  @belongsTo(() => InvestorProfile)
  investorId: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: Object.values(InvestorEscrowLedgerType),
    },
  })
  type: InvestorEscrowLedgerType;

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
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  balanceBefore: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  balanceAfter: number;

  @property({
    type: 'string',
    required: true,
    default: InvestorEscrowLedgerStatus.PENDING,
    jsonSchema: {
      enum: Object.values(InvestorEscrowLedgerStatus),
    },
  })
  status: InvestorEscrowLedgerStatus;

  @property({
    type: 'string',
    postgresql: {
      dataType: 'uuid',
    },
  })
  transactionId?: string;

  @property({
    type: 'string',
    required: true,
  })
  referenceType: string;

  @property({
    type: 'string',
    required: true,
  })
  referenceId: string;

  @property({
    type: 'string',
  })
  remarks?: string;

  @property({
    type: 'object',
  })
  metadata?: object;

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

  @property({
    type: 'string',
  })
  createdBy?: string;

  @property({
    type: 'string',
  })
  updatedBy?: string;

  @property({
    type: 'string',
  })
  deletedBy?: string;

  constructor(data?: Partial<InvestorEscrowLedger>) {
    super(data);
  }
}

export interface InvestorEscrowLedgerRelations {
  // describe navigational properties here
}

export type InvestorEscrowLedgerWithRelations = InvestorEscrowLedger &
  InvestorEscrowLedgerRelations;
