import {Entity, model, property, belongsTo} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_profile',
      schema: 'public',
    },
  },
})
export class BusinessKycProfile extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;

  @property({
    type: 'number',
    required: true,
  })
  yearInBusiness: number;

  @property({
    type: 'number',
    required: true,
  })
  turnover: number;

  @property({
    type: 'number',
    required: true,
  })
  projectedTurnover?: number;

  @property({
    type: 'number',
    required: true,
  })
  ebitdaMargin: number; // in percentage

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

  constructor(data?: Partial<BusinessKycProfile>) {
    super(data);
  }
}

export interface BusinessKycProfileRelations {
  // describe navigational properties here
}

export type BusinessKycProfileWithRelations = BusinessKycProfile &
  BusinessKycProfileRelations;
