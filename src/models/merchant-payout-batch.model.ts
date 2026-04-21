import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {MerchantPayoutBatchItem} from './merchant-payout-batch-item.model';
import {MerchantPayoutConfig} from './merchant-payout-config.model';
import {MerchantProfiles} from './merchant-profiles.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'merchant_payout_batch',
      schema: 'public',
    },
    indexes: {
      uniqueMerchantPayoutBucket: {
        keys: {
          merchantPayoutConfigId: 1,
          businessDate: 1,
          bucketStartAt: 1,
          bucketEndAt: 1,
        },
        options: {unique: true},
      },
    },
  },
})
export class MerchantPayoutBatch extends Entity {
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
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      errorMessage: 'businessDate must be YYYY-MM-DD',
    },
  })
  businessDate: string;

  @property({
    type: 'date',
    required: true,
  })
  bucketStartAt: Date;

  @property({
    type: 'date',
    required: true,
  })
  bucketEndAt: Date;

  @property({
    type: 'date',
    required: true,
  })
  scheduledFor: Date;

  @property({
    type: 'number',
    postgresql: {
      dataType: 'float',
    },
    jsonSchema: {
      minimum: 0.01,
      maximum: 10,
    },
  })
  frequencyHours?: number;

  @property({
    type: 'string',
    required: true,
    default: 'eod',
    jsonSchema: {
      enum: ['eod', 'bucketed'],
    },
  })
  scheduleMode: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float',
    },
  })
  effectiveDailyCap: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  alreadyReleasedToday: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  eligibleAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  releasedAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  totalFundedAmount: number;

  @property({
    type: 'string',
    required: true,
    default: 'scheduled',
    jsonSchema: {
      enum: [
        'scheduled',
        'opening_sweep',
        'cutoff_sweep',
        'eod_default',
        'retry',
        'fallback',
      ],
    },
  })
  runType: string;

  @property({
    type: 'string',
    required: true,
    default: 'pending',
    jsonSchema: {
      enum: [
        'created',
        'pending',
        'processing',
        'success',
        'partial',
        'failed',
        'skipped',
      ],
    },
  })
  status: string;

  @property({
    type: 'string',
  })
  providerName?: string;

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

  @property({
    type: 'date',
  })
  triggeredAt?: Date;

  @property({
    type: 'date',
  })
  completedAt?: Date;

  @belongsTo(() => MerchantPayoutConfig)
  merchantPayoutConfigId: string;

  @belongsTo(() => MerchantProfiles)
  merchantProfilesId: string;

  @belongsTo(() => Users)
  usersId: string;

  @hasMany(() => MerchantPayoutBatchItem)
  batchItems: MerchantPayoutBatchItem[];

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

  constructor(data?: Partial<MerchantPayoutBatch>) {
    super(data);
  }
}

export interface MerchantPayoutBatchRelations { }

export type MerchantPayoutBatchWithRelations = MerchantPayoutBatch &
  MerchantPayoutBatchRelations;
