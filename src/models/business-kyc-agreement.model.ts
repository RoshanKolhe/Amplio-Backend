import {belongsTo, Entity, model, property} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';
import {CompanyProfiles} from './company-profiles.model';
import {Media} from './media.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_agreement',
      schema: 'public',
    },
  },
})
export class BusinessKycAgreement extends Entity {
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
      enum: [0, 1, 2],
    },
  })
  status: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1],
    },
  })
  mode: number;

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

  @belongsTo(() => BusinessKyc)
  businessKycId: string;

  @belongsTo(() => CompanyProfiles)
  companyProfilesId: string;

  @belongsTo(() => Media)
  mediaId: string;

  constructor(data?: Partial<BusinessKycAgreement>) {
    super(data);
  }
}

export interface BusinessKycAgreementRelations { }

export type BusinessKycAgreementWithRelations =
  BusinessKycAgreement & BusinessKycAgreementRelations;
