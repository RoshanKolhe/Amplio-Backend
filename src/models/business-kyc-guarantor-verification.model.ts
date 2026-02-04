import {belongsTo, Entity, model, property} from '@loopback/repository';
import {BusinessKycGuarantor} from './business-kyc-guarantor.model';
import {Media} from './media.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_guarantor_verification',
      schema: 'public',
    },
  },
})
export class BusinessKycGuarantorVerification extends Entity {


  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;

  @belongsTo(() => BusinessKycGuarantor)
  businessKycGuarantorId: string;

  @belongsTo(() => Media)
  mediaId: string;

  @property({
    type: 'string',
  })
  verificationUrl?: string;

  @property({type: 'boolean', default: false})
  isVerified?: boolean;

  @property({type: 'boolean', default: false})
  isUsed?: boolean;

  @property({type: 'date'})
  verifiedAt?: Date;

  @property({type: 'date'})
  expiresAt?: Date;

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

  constructor(data?: Partial<BusinessKycGuarantorVerification>) {
    super(data);
  }
}

export interface BusinessKycGuarantorVerificationRelations {
  // describe navigational properties here
}

export type BusinessKycGuarantorVerificationWithRelations = BusinessKycGuarantorVerification & BusinessKycGuarantorVerificationRelations;
