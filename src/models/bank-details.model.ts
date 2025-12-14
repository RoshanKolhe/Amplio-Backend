import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'bank_details',
      schema: 'public',
    },
    indexes: {
      uniqueBankDetails: {
        keys: {usersId: 1, accountNumber: 1, roleValue: 1},
        options: {unique: true},
      },
    },
  },
})
export class BankDetails extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
    required: true
  })
  bankName: string;

  @property({
    type: 'string',
    required: true
  })
  bankShortCode: string;

  @property({
    type: 'string',
    required: true
  })
  ifscCode: string;

  @property({
    type: 'string',
    required: true
  })
  branchName: string;

  @property({
    type: 'string'
  })
  bankAddress?: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0 = current, 1 = saving
    },
  })
  accountType: number; //  0 => current 1 => saving

  @property({
    type: 'string',
    required: true
  })
  accountHolderName: string;

  @property({
    type: 'string',
    required: true
  })
  accountNumber: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0=cheque, 1=statement
    },
  })
  bankAccountProofType: number; // 0 => cancelled cheque 1 => statement

  @belongsTo(() => Media)
  bankAccountProofId: string;

  @belongsTo(() => Users)
  usersId: string;

  @property({
    type: 'string',
    required: true
  })
  roleValue: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2], // 0 => under review 1 => approved 2 => rejected
    },
  })
  status: number; // 0 => under review 1 => approved 2 => rejected

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0=auto OCR, 1=manual team verification
    },
  })
  mode: number; // 0 => auto 1 => human

  @property({
    type: 'string',
  })
  reason?: string; // if rejection is there

  @property({
    type: 'date',
  })
  verifiedAt?: Date;

  @property({
    type: 'boolean',
  })
  isPrimary?: boolean;

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
  constructor(data?: Partial<BankDetails>) {
    super(data);
  }
}

export interface BankDetailsRelations {
  // describe navigational properties here
}

export type BankDetailsWithRelations = BankDetails & BankDetailsRelations;
