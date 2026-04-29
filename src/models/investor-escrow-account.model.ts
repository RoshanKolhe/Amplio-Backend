import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {BankDetails} from './bank-details.model';
import {InvestorEscrowLedger} from './investor-escrow-ledger.model';
import {InvestorProfile} from './investor-profile.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'investor_escrow_accounts',
      schema: 'public',
    },
    indexes: {
      uniqueInvestorEscrowAccount: {
        keys: {investorProfileId: 1},
        options: {unique: true},
      },
    },
  },
})
export class InvestorEscrowAccount extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @belongsTo(() => InvestorProfile)
  investorProfileId: string;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => BankDetails)
  bankDetailsId: string;

  @property({
    type: 'string',
    required: true,
  })
  bankName: string;

  @property({
    type: 'string',
    required: true,
  })
  ifscCode: string;

  @property({
    type: 'string',
    required: true,
  })
  branchName: string;

  @property({
    type: 'string',
  })
  bankAddress?: string;

  @property({
    type: 'string',
    required: true,
  })
  accountHolderName: string;

  @property({
    type: 'string',
    required: true,
  })
  accountNumber: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1],
    },
  })
  accountType: number;

  @property({
    type: 'string',
    required: true,
    default: 'investor_escrow',
    jsonSchema: {
      enum: ['investor_escrow'],
    },
  })
  escrowType: string;

  @property({
    type: 'string',
    required: true,
    default: 'auto_created',
    jsonSchema: {
      enum: ['auto_created', 'inactive'],
    },
  })
  status: string;

  @property({
    type: 'number',
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  currentBalance: number;

  @property({
    type: 'number',
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  blockedBalance: number;

  @property({
    type: 'string',
    default: 'INR',
  })
  currency: string;

  @property({
    type: 'string',
    postgresql: {
      dataType: 'uuid',
    },
  })
  providerBankId?: string;

  @property({
    type: 'date',
  })
  createdOnApprovalAt?: Date;

  @property({
    type: 'boolean',
    default: true,
  })
  isActive?: boolean;

  @property({
    type: 'boolean',
    default: false,
  })
  isDeleted?: boolean;

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
    type: 'date',
  })
  deletedAt?: Date;

  @hasMany(() => InvestorEscrowLedger)
  investorEscrowLedgers: InvestorEscrowLedger[];

  constructor(data?: Partial<InvestorEscrowAccount>) {
    super(data);
  }
}

export interface InvestorEscrowAccountRelations {
  // describe navigational properties here
}

export type InvestorEscrowAccountWithRelations = InvestorEscrowAccount &
  InvestorEscrowAccountRelations;
