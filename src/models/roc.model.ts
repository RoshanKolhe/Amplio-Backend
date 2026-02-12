import {Entity, model, property, belongsTo} from '@loopback/repository';
import {Media} from './media.model';
import {BusinessKyc} from './business-kyc.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_roc',
      schema: 'public',
    },
  },
})
export class Roc extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;

  @property({
    type: 'string',
    required: false,
  })
  serviceRequestNo?: string;

  @property({
    type: 'date',
    required: false,
  })
  filingDate?: Date;

  @property({
    type: 'boolean',
    default: false,
  })
  isAccepted: boolean;

  @property({
    type: 'boolean',
    default: false,
  })
  isNashActivate: boolean;

  @property({
    type: 'string',
  })
  chequeNo?: string;

  @property({
    type: 'string',
  })
  bankName?: string;

  @property({
    type: 'string',
  })
  amount?: string;

  @property({
    type: 'date',
  })
  date?: Date;

  @property({
    type: 'number',
    required: false,
    jsonSchema: {
      enum: [0, 1],
    },
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
    required: true,
  })
  isActive: boolean;

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

  @belongsTo(() => Media)
  chargeFilingId?: string;

  @belongsTo(() => Media)
  backupSecurityId?: string;

  @belongsTo(() => BusinessKyc)
  businessKycId: string;

  constructor(data?: Partial<Roc>) {
    super(data);
  }
}

export interface RocRelations {
  // describe navigational properties here
}

export type RocWithRelations = Roc & RocRelations;
