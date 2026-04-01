import {belongsTo, Entity, model, property, hasMany} from '@loopback/repository';
import {MerchantProfiles} from './merchant-profiles.model';
import {PspMaster} from './psp-master.model';
import {Users} from './users.model';
import {Transaction} from './transaction.model';

@model({
  settings: {
    postgresql: {
      table: 'psp',
      schema: 'public',
    },
  },
})
export class Psp extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
  })
  merchantId: string;

  @property({
    type: 'string',
    required: true,
  })
  settlementAccount: string;

  @property({
    type: 'string',
  })
  settlementAccountNumber?: string;

  @property({
    type: 'string',
  })
  settlementIfsc?: string;

  @property({
    type: 'string',
  })
  apiKey: string;

  @property({
    type: 'string',
  })
  apiSecret: string;

  @property({
    type: 'string',
  })
  publishableKey?: string;

  @property({
    type: 'string',
  })
  merchantAccountId?: string;

  @property({
    type: 'string',
  })
  webhookSecret?: string;

  @property({
    type: 'string',
    jsonSchema: {
      enum: ['sandbox', 'live'],
    },
    default: 'sandbox',
  })
  environment?: string;

  @property({
    type: 'number',
    jsonSchema: {
      enum: [0, 1, 2], // 0 = Review, 1 = Approved, 2 = Rejected
    },
    default: 0,
  })
  status?: number;

  @property({
    type: 'number',
    jsonSchema: {
      enum: [0, 1], // 0=auto OCR, 1=manual team verification
    },
    default: 1,
  })
  mode?: number;

  @property({
    type: 'string',
  })
  reason?: string;

  @property({
    type: 'date',
  })
  verifiedAt?: Date;

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

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => PspMaster)
  pspMasterId: string;

  @belongsTo(() => MerchantProfiles)
  merchantProfilesId: string;

  @hasMany(() => Transaction)
  transactions: Transaction[];

  constructor(data?: Partial<Psp>) {
    super(data);
  }
}

export interface PspRelations {
  // describe navigational properties here
  pspMaster?: PspMaster;
}

export type PspWithRelations = Psp & PspRelations;
