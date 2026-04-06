import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'compliance_and_declarations',
      schema: 'public',
    },
    indexes: {
      uniqueComplianceDeclaration: {
        keys: {usersId: 1, roleValue: 1, identifierId: 1},
        options: {unique: true},
      },
    },
  },
})
export class ComplianceAndDeclarations extends Entity {

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
    required: true,
  })
  taxCountry: string;

  @property({
    type: 'string',
    required: true,
  })
  taxNumber: string;

  @property({
    type: 'boolean',
    required: true,
    default: false,
  })
  isPEP: boolean;


  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['OWN_FUNDS', 'THIRD_PARTY'],
    },
  })
  investmentOnBehalf: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['DOMESTIC', 'INTERNATIONAL'],
    },
  })
  crossBorderFlow: string;

  @property({
    type: 'string',
    required: true,
  })
  sourceOfFunds: string;

  @belongsTo(() => Users)
  usersId: string;

  @property({
    type: 'string',
    required: true,
  })
  roleValue: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  identifierId: string;

  @property({
    type: 'boolean',
    required: true,
    default: false,
  })
  riskDisclosureAccepted: boolean;

  @property({
    type: 'boolean',
    required: true,
    default: false,
  })
  suitabilityConfirmed: boolean;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2], // 0=pending, 1=approved, 2=rejected
    },
  })
  status: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0=auto OCR, 1=manual team verification
    },
  })
  mode: number;

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

  constructor(data?: Partial<ComplianceAndDeclarations>) {
    super(data);
  }
}

export interface ComplianceAndDeclarationsRelations {
  // describe navigational properties here
}

export type ComplianceAndDeclarationsWithRelations = ComplianceAndDeclarations & ComplianceAndDeclarationsRelations;
