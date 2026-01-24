import {belongsTo, Entity, model, property} from '@loopback/repository';
import {ChargeTypes} from './charge-types.model';
import {CollateralTypes} from './collateral-types.model';
import {Media} from './media.model';
import {OwnershipTypes} from './ownership-types.model';

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

  @belongsTo(() => Media)
  securityDocumentId: string;

  @belongsTo(() => Media)
  assetCoverCertificateId: string;

  @belongsTo(() => Media)
  valuationReportId: string;

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
