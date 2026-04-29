import {belongsTo, Entity, hasOne, model, property} from '@loopback/repository';
import {InvestorEscrowAccount} from './investor-escrow-account.model';
import {InvestorPanCards} from './investor-pan-cards.model';
import {InvestorType} from './investor-type.model';
import {KycApplications} from './kyc-applications.model';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'investor_profiles',
      schema: 'public',
    },
  },
})
export class InvestorProfile extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @property({
    type: 'string',
  })
  fullName: string;

  @property({
    type: 'string',
    jsonSchema: {
      enum: [
        'male',
        'female',
        'other'
      ]
    }
  })
  gender: string;

  @property({
    type: 'string',
    jsonSchema: {
      enum: [
        'manual',
        'auto'
      ]
    }
  })
  kycMode: string;

  @belongsTo(() => Media)
  aadharFrontImageId: string;

  @belongsTo(() => Media)
  aadharBackImageId: string;

  @belongsTo(() => Media)
  selfieId: string;

  // Institunational

  @property({
    type: 'string',
    required: true,
    default: 'individual',
    jsonSchema: {
      enum: ['individual', 'institutional'],
    },
  })
  investorKycType?: string;

  @property({
    type: 'string',
    jsonSchema: {
      minLength: 3,
      maxLength: 200,
    },
  })
  companyName?: string;

  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$',
      minLength: 21,
      maxLength: 21,
      errorMessage: {
        pattern: 'Invalid CIN format',
      },
    },
  })
  CIN?: string;

  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
      minLength: 15,
      maxLength: 15,
      errorMessage: {
        pattern: 'Invalid GSTIN format',
      },
    },
  })
  GSTIN?: string;

  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      errorMessage: 'dateOfIncorporation must be YYYY-MM-DD',
    },
  })
  dateOfIncorporation?: string;

  @property({
    type: 'string',
    jsonSchema: {
      minLength: 2,
      maxLength: 100,
    },
  })
  cityOfIncorporation?: string;

  @property({
    type: 'string',
    jsonSchema: {
      minLength: 2,
      maxLength: 100,
    },
  })
  stateOfIncorporation?: string;

  @property({
    type: 'string',
    jsonSchema: {
      minLength: 2,
      maxLength: 100,
    },
  })
  countryOfIncorporation?: string;

  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      errorMessage: {
        pattern: 'Invalid UDYAM Registration Number format',
      },
    },
  })
  udyamRegistrationNumber?: string;

  @belongsTo(() => Media, {name: 'media'})
  investorLogo: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
    jsonSchema: {
      minLength: 10,
    },
  })
  investorAbout?: string;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => KycApplications)
  kycApplicationsId: string;


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

  @belongsTo(() => InvestorType)
  investorTypeId?: string;


  @property({
    type: 'date',
    defaultFn: 'now',
  })
  updatedAt?: Date;

  @property({
    type: 'date',
  })
  deletedAt?: Date;

  @hasOne(() => InvestorPanCards)
  investorPanCards: InvestorPanCards;

  @hasOne(() => InvestorEscrowAccount)
  investorEscrowAccount: InvestorEscrowAccount;



  constructor(data?: Partial<InvestorProfile>) {
    super(data);
  }
}

export interface InvestorProfileRelations {
  // describe navigational properties here
}

export type InvestorProfileWithRelations = InvestorProfile & InvestorProfileRelations;

