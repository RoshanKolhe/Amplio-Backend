import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'address_details',
      schema: 'public',
    },
    indexes: {
      uniqueAddress: {
        keys: {usersId: 1, roleValue: 1, identifierId: 1, addressType: 1},
        options: {unique: true},
      },
    },
  },
})
export class AddressDetails extends Entity {
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
      enum: [
        'registered',
        'correspondence'
      ]
    }
  })
  addressType: string;

  @property({
    type: 'string',
    required: true
  })
  addressLineOne: string;

  @property({
    type: 'string',
  })
  addressLineTwo?: string;

  @property({
    type: 'string',
    required: true
  })
  country: string;

  @property({
    type: 'string',
    required: true
  })
  city: string;

  @property({
    type: 'string',
    required: true
  })
  state: string;

  @property({
    type: 'string',
    required: true
  })
  pincode: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [
        'electricity_bill',
        'lease_agreement'
      ]
    }
  })
  documentType: string;

  @belongsTo(() => Media)
  addressProofId: string;

  @belongsTo(() => Users)
  usersId: string;

  @property({
    type: 'string',
    required: true
  })
  roleValue: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'}
  })
  identifierId: string;

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
  constructor(data?: Partial<AddressDetails>) {
    super(data);
  }
}

export interface AddressDetailsRelations {
  // describe navigational properties here
}

export type AddressDetailsWithRelations = AddressDetails & AddressDetailsRelations;
