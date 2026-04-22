import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Spv} from './spv.model';
import {Transaction} from './transaction.model';

@model({
  settings: {
    postgresql: {
      table: 'escrow_transactions',
      schema: 'public',
    },
  },
})
export class EscrowTransaction extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @belongsTo(() => Transaction)
  transactionId: string;

  @belongsTo(() => Spv)
  spvId: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float',
    },
  })
  amount: number;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['PENDING', 'MATCHED'],
    },
    default: 'PENDING',
  })
  status: string;

  @property({
    type: 'date',
  })
  matchedAt?: Date;

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

  constructor(data?: Partial<EscrowTransaction>) {
    super(data);
  }
}

export interface EscrowTransactionRelations {}

export type EscrowTransactionWithRelations = EscrowTransaction &
  EscrowTransactionRelations;
