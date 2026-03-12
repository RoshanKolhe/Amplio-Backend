import {belongsTo, Entity, hasOne, model, property} from '@loopback/repository';
import {KycApplications} from './kyc-applications.model';
import {Media} from './media.model';
import {MerchantDealershipType} from './merchant-dealership-type.model';
import {MerchantPanCard} from './merchant-pan-card.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'merchant_profiles',
      schema: 'public',
    },
    indexes: {
      uniqueMerchantCIN: {
        keys: {CIN: 1},
        options: {unique: true},
      },
      uniqueMerchantGSTIN: {
        keys: {GSTIN: 1},
        options: {unique: true},
      },
      uniqueMerchantUdyam: {
        keys: {udyamRegistrationNumber: 1},
        options: {unique: true},
      },
    },
  },
})
export class MerchantProfiles extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 3,
      maxLength: 200,
    },
  })
  companyName: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$',
      minLength: 21,
      maxLength: 21,
      errorMessage: {
        pattern: 'Invalid CIN format',
      },
    },
  })
  CIN: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
      minLength: 15,
      maxLength: 15,
      errorMessage: {
        pattern: 'Invalid GSTIN format',
      },
    },
  })
  GSTIN: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      errorMessage: 'dateOfIncorporation must be YYYY-MM-DD',
    },
  })
  dateOfIncorporation: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 2,
      maxLength: 100,
    },
  })
  cityOfIncorporation: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 2,
      maxLength: 100,
    },
  })
  stateOfIncorporation: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 2,
      maxLength: 100,
    },
  })
  countryOfIncorporation: string;

  @property({
    type: 'string',
    // required: true,
    jsonSchema: {
      pattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      errorMessage: {
        pattern: 'Invalid UDYAM Registration Number format',
      },
    },
  })
  udyamRegistrationNumber: string;

  @belongsTo(() => Media, {name: 'media'})
  merchantLogo: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
    jsonSchema: {
      minLength: 10,
    },
  })
  companyAbout?: string;

  @hasOne(() => MerchantPanCard)
  merchantPanCard: MerchantPanCard;

  // kycpplication user dealrshiptype

  @property({
    type: 'boolean',
    default: false,
  })
  isBusinessKycComplete?: boolean;


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

  @belongsTo(() => MerchantDealershipType)
  merchantDealershipTypeId: string;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => KycApplications)
  kycApplicationsId: string;

  @property({
    type: 'date',
  })
  deletedAt?: Date;

  constructor(data?: Partial<MerchantProfiles>) {
    super(data);
  }
}

export interface MerchantProfilesRelations {
  // describe navigational properties here
}

export type MerchantProfilesWithRelations = MerchantProfiles & MerchantProfilesRelations;
