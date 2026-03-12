import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {
      table: 'dealership_types',
      schema: 'public',
    },
    indexes: {
      uniqueDealershipValue: {
        keys: {value: 1},
        options: {unique: true},
      }
    },
  },
})
export class MerchantDealershipType extends Entity {
    @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
    required: true
  })
  label: string;

  @property({
    type: 'string',
    required: true
  })
  value: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
  })
  description?: string;

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

  constructor(data?: Partial<MerchantDealershipType>) {
    super(data);
  }
}

export interface MerchantDealershipTypeRelations {
  // describe navigational properties here
}

export type MerchantDealershipTypeWithRelations = MerchantDealershipType & MerchantDealershipTypeRelations;
