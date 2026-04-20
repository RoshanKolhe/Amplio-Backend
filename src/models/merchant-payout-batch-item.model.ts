import {belongsTo, Entity, model, property} from '@loopback/repository';
import {MerchantPayoutBatch} from './merchant-payout-batch.model';
import {Transaction} from './transaction.model';

@model({
  settings: {
    postgresql: {
      table: 'merchant_payout_batch_item',
      schema: 'public',
    },
    indexes: {
      uniqueBatchTransaction: {
        keys: {
          merchantPayoutBatchId: 1,
          transactionId: 1,
        },
        options: {unique: true},
      },
    },
  },
})
export class MerchantPayoutBatchItem extends Entity {
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
    postgresql: {
      dataType: 'float',
    },
  })
  transactionAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  totalReceivedAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  haircutPercentage: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  transactionNetAmount: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float',
    },
  })
  allocatedAmount: number;

  @property({
    type: 'string',
    required: true,
    default: 'allocated',
    jsonSchema: {
      enum: ['allocated', 'released', 'failed', 'reversed'],
    },
  })
  status: string;

  @property({
    type: 'string',
  })
  providerReferenceId?: string;

  @property({
    type: 'string',
    postgresql: {
      dataType: 'text',
    },
  })
  failureReason?: string;

  @property({
    type: 'object',
    postgresql: {
      dataType: 'jsonb',
    },
  })
  providerResponse?: object;

  @belongsTo(() => MerchantPayoutBatch)
  merchantPayoutBatchId: string;

  @belongsTo(() => Transaction)
  transactionId: string;

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

  constructor(data?: Partial<MerchantPayoutBatchItem>) {
    super(data);
  }
}

export interface MerchantPayoutBatchItemRelations { }

export type MerchantPayoutBatchItemWithRelations =
  MerchantPayoutBatchItem & MerchantPayoutBatchItemRelations;
