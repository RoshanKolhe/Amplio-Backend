import {Entity, model, property, belongsTo} from '@loopback/repository';
import {Media} from './media.model';
import {BusinessKyc} from './business-kyc.model';
import {BusinessKycDocumentType} from './business-kyc-document-type.model';
import {CompanyProfiles} from './company-profiles.model';

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
    type: 'number',
    required: false,
    jsonSchema: {
      enum: [0, 1],
    },
  })
  mode?: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2], // 0: pending, 1: approved, 2: rejected
    },
    default: 0,
  })
  status: number;

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

  @belongsTo(() => BusinessKycDocumentType)
  businessKycDocumentTypeId: string;

  @belongsTo(() => CompanyProfiles)
  companyProfilesId: string;

  constructor(data?: Partial<Roc>) {
    super(data);
  }
}

export interface RocRelations {
  // describe navigational properties here
}

export type RocWithRelations = Roc & RocRelations;
