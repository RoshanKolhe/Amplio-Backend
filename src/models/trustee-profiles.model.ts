import {belongsTo, Entity, hasOne, model, property} from '@loopback/repository';
import {KycApplications} from './kyc-applications.model';
import {Media} from './media.model';
import {TrusteeEntityTypes} from './trustee-entity-types.model';
import {TrusteePanCards} from './trustee-pan-cards.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'trustee_profiles',
      schema: 'public',
    },
    indexes: {
      uniqueTrusteeCIN: {
        keys: {CIN: 1},
        options: {unique: true},
      },
      uniqueTrusteeGSTIN: {
        keys: {GSTIN: 1},
        options: {unique: true},
      },
      uniqueTrusteeUdyam: {
        keys: {udyamRegistrationNumber: 1},
        options: {unique: true},
      },
    },
  },
})
export class TrusteeProfiles extends Entity {
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
  legalEntityName: string;

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
    jsonSchema: {
      pattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      errorMessage: {
        pattern: 'Invalid UDYAM Registration Number format',
      },
    },
  })
  udyamRegistrationNumber?: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^IND\\d{9}$',
      errorMessage: 'Invalid SEBI Registration Number. Must be like IND000000501',
    },
  })
  sebiRegistrationNumber: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      errorMessage: 'must be YYYY-MM-DD',
    },
  })
  sebiValidityDate: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
    jsonSchema: {
      minLength: 10,
    },
  })
  trusteeAbout?: string;

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

  @hasOne(() => TrusteePanCards)
  trusteePanCards: TrusteePanCards;

  @belongsTo(() => KycApplications)
  kycApplicationsId: string;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => Media)
  trusteeLogoId: string;

  @belongsTo(() => TrusteeEntityTypes)
  trusteeEntityTypesId: string;
  constructor(data?: Partial<TrusteeProfiles>) {
    super(data);
  }
}

export interface TrusteeProfilesRelations {
  // describe navigational properties here
}

export type TrusteeProfilesWithRelations = TrusteeProfiles & TrusteeProfilesRelations;
