import {belongsTo, Entity, model, property} from '@loopback/repository';
import {ChargeTypes} from './charge-types.model';
import {CollateralTypes} from './collateral-types.model';
// import {Media} from './media.model';
import {OwnershipTypes} from './ownership-types.model';
import {BusinessKyc} from './business-kyc.model';
import {CompanyProfiles} from './company-profiles.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_collateral_assets',
      schema: 'public',
    },
  },
})
export class BusinessKycCollateralAssets extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'number',
    required: true,
  })
  estimatedValue: number;

  @property({
    type: 'string',
    required: true,
  })
  securityDocumentRef: string;

  @property({
    type: 'string',
    required: true,
  })
  trustName: string;

  @property({
    type: 'date',
    required: true,
  })
  valuationDate: Date;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
    jsonSchema: {
      minLength: 10,
    },
    required: true,
  })
  description: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
  })
  remark?: string;

  @belongsTo(() => CollateralTypes)
  collateralTypesId: string;

  @belongsTo(() => ChargeTypes)
  chargeTypesId: string;

  @belongsTo(() => OwnershipTypes)
  ownershipTypesId: string;

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

  // @belongsTo(() => Media)
  // securityDocumentId: string;

  // @belongsTo(() => Media)
  // assetCoverCertificateId: string;

  // @belongsTo(() => Media)
  // valuationReportId: string;

  @belongsTo(() => BusinessKyc)
  businessKycId: string;

  @belongsTo(() => CompanyProfiles)
  companyProfilesId: string;
  // @belongsTo(() => BondIssueApplication)
  // bondIssueApplicationId: string;

  constructor(data?: Partial<BusinessKycCollateralAssets>) {
    super(data);
  }
}

export interface BusinessKycCollateralAssetsRelations {
  // describe navigational properties here
}

export type BusinessKycCollateralAssetsWithRelations =
  BusinessKycCollateralAssets & BusinessKycCollateralAssetsRelations;
