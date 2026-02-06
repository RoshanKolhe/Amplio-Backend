import {belongsTo, Entity, hasOne, model, property, hasMany} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';
import {CompanyEntityType} from './company-entity-type.model';
import {CompanyPanCards} from './company-pan-cards.model';
import {CompanySectorType} from './company-sector-type.model';
import {KycApplications} from './kyc-applications.model';
import {Media} from './media.model';
import {Users} from './users.model';
import {BusinessKycProfile} from './business-kyc-profile.model';
import {BusinessKycAuditedFinancials} from './business-kyc-audited-financials.model';
import {BusinessKycGuarantor} from './business-kyc-guarantor.model';
import {BusinessKycCollateralAssets} from './business-kyc-collateral-assets.model';
import {BusinessKycAgreement} from './business-kyc-agreement.model';

@model({
  settings: {
    postgresql: {
      table: 'company_profiles',
      schema: 'public',
    },
    indexes: {
      uniqueCIN: {
        keys: {CIN: 1},
        options: {unique: true},
      },
      uniqueGSTIN: {
        keys: {GSTIN: 1},
        options: {unique: true},
      },
      uniqueUdyam: {
        keys: {udyamRegistrationNumber: 1},
        options: {unique: true},
      },
    },
  },
})
export class CompanyProfiles extends Entity {
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
    required: true,
    jsonSchema: {
      pattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      errorMessage: {
        pattern: 'Invalid UDYAM Registration Number format',
      },
    },
  })
  udyamRegistrationNumber: string;

  @belongsTo(() => Media, {name: 'companyLogoData'})
  companyLogo: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
    jsonSchema: {
      minLength: 10,
    },
  })
  companyAbout?: string;

  @hasOne(() => CompanyPanCards)
  companyPanCards: CompanyPanCards;

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



  @property({
    type: 'date',
  })
  deletedAt?: Date;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => CompanyEntityType)
  companyEntityTypeId: string;

  @belongsTo(() => CompanySectorType)
  companySectorTypeId: string;

  @belongsTo(() => KycApplications)
  kycApplicationsId: string;

  @hasOne(() => BusinessKyc)
  businessKyc: BusinessKyc;

  @hasOne(() => BusinessKycProfile)
  businessKycProfile: BusinessKycProfile;

  @hasMany(() => BusinessKycAuditedFinancials)
  businessKycAuditedFinancials: BusinessKycAuditedFinancials[];

  @hasMany(() => BusinessKycGuarantor)
  businessKycGuarantors: BusinessKycGuarantor[];

  @hasMany(() => BusinessKycCollateralAssets)
  businessKycCollateralAssets: BusinessKycCollateralAssets[];

  @hasMany(() => BusinessKycAgreement)
  businessKycAgreements: BusinessKycAgreement[];

  constructor(data?: Partial<CompanyProfiles>) {
    super(data);
  }
}

export interface CompanyProfilesRelations { }
export type CompanyProfilesWithRelations = CompanyProfiles & CompanyProfilesRelations;
