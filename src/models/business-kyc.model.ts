import {belongsTo, Entity, hasMany, hasOne, model, property} from '@loopback/repository';
import {BusinessKycAuditedFinancials} from './business-kyc-audited-financials.model';
import {BusinessKycClientProfile} from './business-kyc-client-profile.model';
import {BusinessKycCollateralAssets} from './business-kyc-collateral-assets.model';
import {BusinessKycGuarantor} from './business-kyc-guarantor.model';
import {BusinessKycProfile} from './business-kyc-profile.model';
import {BusinessKycStatusMaster} from './business-kyc-status-master.model';
import {CompanyProfiles} from './company-profiles.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc',
      schema: 'public',
    },
  },
})
export class BusinessKyc extends Entity {
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
  status?: string;

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

  @belongsTo(() => CompanyProfiles)
  companyProfilesId: string;

  @hasOne(() => BusinessKycProfile)
  businessKycProfile: BusinessKycProfile;

  @hasOne(() => BusinessKycAuditedFinancials)
  businessKycAuditedFinancials: BusinessKycAuditedFinancials;

  @hasMany(() => BusinessKycCollateralAssets)
  businessKycCollateralAssets: BusinessKycCollateralAssets[];

  @hasMany(() => BusinessKycClientProfile)
  businessKycClientProfiles: BusinessKycClientProfile[];

  @hasMany(() => BusinessKycGuarantor)
  businessKycGuarantors: BusinessKycGuarantor[];


  @belongsTo(() => BusinessKycStatusMaster)
  businessKycStatusMasterId?: string;

  // @property({
  //   type: 'string',
  // })
  // companyProfilesId?: string;

  constructor(data?: Partial<BusinessKyc>) {
    super(data);
  }
}

export interface BusinessKycRelations {
}

export type BusinessKycWithRelations = BusinessKyc & BusinessKycRelations;
