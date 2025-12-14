import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'kyc_applications',
      schema: 'public',
    },
  },
})
export class KycApplications extends Entity {
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
  roleValue: string;

  @property({
    type: 'boolean',
    default: false,
  })
  humanInteraction?: boolean;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0=auto OCR, 1=manual team verification
    },
  })
  mode: number;   // 0 => auto, 1 => manual

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2, 3],  // 0 => pending, 1 => under review 2 => approved, 3 => rejected,
    },
  })
  status: number;   // 0 => pending, 1 => under review 2 => approved, 3 => rejected,

  @property({
    type: 'string',
  })
  reason?: string; // if rejection is there

  @property({
    type: 'date',
  })
  verifiedAt?: Date;

  @property({
    type: 'array',
    itemType: 'string',
  })
  currentProgress?: string[];   // ['pan_uploaded', 'aadhaar_verified']   // some kyc forms has stepper at frontend so i should return prev done steps.

  @property({
    type: 'string',
    required: true
  })
  identifierId: string; // based on roleValue we will search in resp. model.

  @belongsTo(() => Users)
  usersId: string;

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
  constructor(data?: Partial<KycApplications>) {
    super(data);
  }
}

export interface KycApplicationsRelations {
  // describe navigational properties here
}

export type KycApplicationsWithRelations = KycApplications & KycApplicationsRelations;
