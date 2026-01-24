import {Entity, model, property, belongsTo} from '@loopback/repository';
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
  progress: string;

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
  
  // @property({
  //   type: 'string',
  // })
  // companyProfilesId?: string;

  constructor(data?: Partial<BusinessKyc>) {
    super(data);
  }
}

export interface BusinessKycRelations {
  // describe navigational properties here
}

export type BusinessKycWithRelations = BusinessKyc & BusinessKycRelations;
