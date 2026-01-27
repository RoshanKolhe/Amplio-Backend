import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_status_master',
      schema: 'public',
    },
    indexes: {
      uniqueStatusValue: {
        keys: {value: 1},
        options: {unique: true},
      },
      uniqueStatusSequence: {
        keys: {sequenceOrder: 1},
        options: {unique: true},
      },
    },
  },
})
export class BusinessKycStatusMaster extends Entity {

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
    required: true
  })
  status: string;

  @property({
    type: 'string',
    required: true
  })
  value: string;

  @property({
    type: 'number',
    required: true
  })
  sequenceOrder: number;

  @property({
    type: 'boolean',
    default: false,
  })
  isInitial?: boolean;

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
  constructor(data?: Partial<BusinessKycStatusMaster>) {
    super(data);
  }
}

export interface BusinessKycStatusMasterRelations {
  // describe navigational properties here
}

export type BusinessKycStatusMasterWithRelations = BusinessKycStatusMaster & BusinessKycStatusMasterRelations;
