import {Entity, model, property, belongsTo} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';

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
    required: true,
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
    type: 'string',
    required: true,
  })
  companyPanId: string;

  @property({
    type: 'string',
    required: true,
  })
  companyAadharId: string;

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

  constructor(data?: Partial<BusinessKycGuarantor>) {
    super(data);
  }
}

export interface BusinessKycGuarantorRelations {
  // describe navigational properties here
}

export type BusinessKycGuarantorWithRelations = BusinessKycGuarantor & BusinessKycGuarantorRelations;
