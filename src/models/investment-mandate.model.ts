import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'investment_mandate',
      schema: 'public',
    },
    indexes: {
      uniqueInvestmentMandate: {
        keys: {usersId: 1, roleValue: 1, identifierId: 1},
        options: {unique: true},
      },
    },
  },
})
export class InvestmentMandate extends Entity {

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
    type: 'number',
    required: true,
  })
  minimumInvestmentAmount: number;

  @property({
    type: 'number',
    required: true,
  })
  maximumTotalExposure: number;

  @property({
    type: 'number',
    required: true,
  })
  minimumTenorDays: number;

  @property({
    type: 'number',
    required: true,
  })
  maximumTenorDays: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  preferredYield: number;

  @property({
    type: 'boolean',
    default: false,
  })
  autoReinvestOnMaturity: boolean;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  maxExposureSingleMerchant: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  maxExposureSingleBank: number;

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
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2],
    },
  })
  status: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1],
    },
  })
  mode: number;

  @property({
    type: 'string',
  })
  reason?: string;

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


  constructor(data?: Partial<InvestmentMandate>) {
    super(data);
  }
}

export interface InvestmentMandateRelations { }

export type InvestmentMandateWithRelations =
  InvestmentMandate & InvestmentMandateRelations;
