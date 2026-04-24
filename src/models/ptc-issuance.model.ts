import {belongsTo, Entity, model, property} from '@loopback/repository';
import {PoolFinancials} from './pool-financials.model';
import {Spv} from './spv.model';
import {Transaction} from './transaction.model';

@model({
  settings: {
    postgresql: {
      table: 'ptc_issuances',
      schema: 'public',
    },
    indexes: {
      uniquePtcIssuanceByTransaction: {
        keys: {transactionId: 1},
        options: {unique: true},
      },
    },
  },
})
export class PtcIssuance extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @belongsTo(() => Spv)
  spvId: string;

  @belongsTo(() => PoolFinancials)
  poolFinancialsId: string;

  @belongsTo(() => Transaction)
  transactionId: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float',
    },
  })
  unitPrice: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float',
    },
  })
  issuedAmount: number;

  @property({
    type: 'number',
    required: true,
  })
  totalUnits: number;

  @property({
    type: 'number',
    default: 0,
  })
  soldUnits: number;

  @property({
    type: 'number',
    required: true,
  })
  remainingUnits: number;

  @property({
    type: 'string',
    required: true,
    default: 'ACTIVE',
    jsonSchema: {
      enum: ['ACTIVE', 'SOLD_OUT', 'INACTIVE'],
    },
  })
  status: string;

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

  constructor(data?: Partial<PtcIssuance>) {
    super(data);
  }
}

export interface PtcIssuanceRelations {}

export type PtcIssuanceWithRelations = PtcIssuance & PtcIssuanceRelations;
