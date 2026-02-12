import {Entity, model, property, belongsTo} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';
import {CompanyProfiles} from './company-profiles.model';
import {BusinessKycDocumentType} from './business-kyc-document-type.model';
import {Media} from './media.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_dpn',
      schema: 'public',
    },
    indexes: {
      uniqueDpn: {
        keys: {
          businessKycId: 1,
          businessKycDocumentTypeId: 1,
        },
        options: {unique: true},
      },
    },
  },
})
export class BusinessKycDpn extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;

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
    type: 'boolean',
    default: false,
  })
  isAccepted?: boolean;

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

  @belongsTo(() => BusinessKyc)
  businessKycId: string;

  @belongsTo(() => CompanyProfiles)
  companyProfilesId: string;

  @belongsTo(() => BusinessKycDocumentType)
  businessKycDocumentTypeId: string;

  @belongsTo(() => Media)
  mediaId: string;

  constructor(data?: Partial<BusinessKycDpn>) {
    super(data);
  }
}

export interface BusinessKycDpnRelations {
  // describe navigational properties here
}

export type BusinessKycDpnWithRelations = BusinessKycDpn &
  BusinessKycDpnRelations;
