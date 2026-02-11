import {Entity, model, property, belongsTo, hasOne} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';
import {CompanyProfiles} from './company-profiles.model';
import {Media} from './media.model';
import {BusinessKycGuarantorVerification} from './business-kyc-guarantor-verification.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_guarantor',
      schema: 'public',
    },
  },
})
export class BusinessKycGuarantor extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;

  @property({
    type: 'string',
    required: true,
  })
  guarantorCompanyName: string;

  @property({
    type: 'string',
  })
  CIN: string;

  @property({
    type: 'string',
    required: true,
  })
  phoneNumber?: string;

  @property({
    type: 'string',
    required: true,
  })
  email: string;

  @property({
    type: 'string',
    required: true,
  })
  guarantorType: string;

  @property({
    type: 'number',
    required: true,
  })
  guaranteedAmountLimit: number;

  @property({
    type: 'number',
    required: true,
  })
  estimatedNetWorth: number;

  @property({
    type: 'string',
    required: true,
  })
  fullName: string;

  @property({
    type: 'string',
    required: true,
  })
  panNumber: string;

  @property({
    type: 'string',
    required: true,
  })
  adharNumber: string;
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
    type: 'boolean',
    default: false,
  })
  isExecutionDone: boolean;

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
  companyAadharId: string;

  @belongsTo(() => Media)
  companyPanId: string;

  @hasOne(() => BusinessKycGuarantorVerification)
  businessKycGuarantorVerification: BusinessKycGuarantorVerification;

  constructor(data?: Partial<BusinessKycGuarantor>) {
    super(data);
  }
}

export interface BusinessKycGuarantorRelations {
  // describe navigational properties here
}

export type BusinessKycGuarantorWithRelations = BusinessKycGuarantor &
  BusinessKycGuarantorRelations;
