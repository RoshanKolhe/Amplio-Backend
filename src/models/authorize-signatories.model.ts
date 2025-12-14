import {Entity, model, property, belongsTo} from '@loopback/repository';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'authorize_signatories',
      schema: 'public',
    },
    indexes: {
      uniqueAuthorizeSignatory: {
        keys: {usersId: 1, roleValue: 1, identifierId: 1, submittedPanNumber: 1},
        options: {unique: true},
      },
    },
  },
})
export class AuthorizeSignatories extends Entity {
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
  fullName: string;

  @property({
    type: 'string',
    required: true
  })
  email: string;

  @property({
    type: 'string',
    required: true
  })
  phone: string;

  // designation selection
  @property({
    type: 'string',
    required: true,
    jsonSchema: {enum: ['dropdown', 'custom']}
  })
  designationType: string;

  @property({
    type: 'string',
    required: true
  })
  designationValue: string;

  // Submitted PAN info
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$'
    }
  })
  submittedPanNumber: string;

  @property({
    type: 'string',
    required: true
  })
  submittedPanFullName?: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$'
    }
  })
  submittedDateOfBirth: string;

  // OCR extracted info
  @property({
    type: 'string',
  })
  extractedPanNumber?: string;

  @property({
    type: 'string',
  })
  extractedPanFullName?: string;

  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$'
    }
  })
  extractedDateOfBirth?: string;

  @belongsTo(() => Media)
  panCardFileId: string;

  @belongsTo(() => Media)
  boardResolutionFileId: string;

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
  constructor(data?: Partial<AuthorizeSignatories>) {
    super(data);
  }
}

export interface AuthorizeSignatoriesRelations {
  // describe navigational properties here
}

export type AuthorizeSignatoriesWithRelations = AuthorizeSignatories & AuthorizeSignatoriesRelations;
