import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {MerchantPayoutBatch} from './merchant-payout-batch.model';
import {MerchantProfiles} from './merchant-profiles.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'merchant_payout_config',
      schema: 'public',
    },
    indexes: {
      uniqueMerchantPayoutConfig: {
        keys: {merchantProfilesId: 1},
        options: {unique: true},
      },
    },
  },
})
export class MerchantPayoutConfig extends Entity {
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
  maxAllowedDailyCap: number;

  @property({
    type: 'number',
    postgresql: {
      dataType: 'float',
    },
  })
  selectedDailyCap?: number;

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
    type: 'string',
    required: true,
    default: '09:00',
    jsonSchema: {
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
      errorMessage: 'startTime must be HH:mm',
    },
  })
  startTime: string;

  @property({
    type: 'string',
    required: true,
    default: '20:00',
    jsonSchema: {
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
      errorMessage: 'cutoffTime must be HH:mm',
    },
  })
  cutoffTime: string;

  @property({
    type: 'string',
    required: true,
    default: 'Asia/Kolkata',
  })
  timezone: string;

  @property({
    type: 'boolean',
    default: true,
  })
  autoPayoutEnabled?: boolean;

  @property({
    type: 'string',
    required: true,
    default: 'none',
    jsonSchema: {
      enum: ['none', 'week', 'month'],
    },
  })
  commitmentUnit: string;

  @property({
    type: 'number',
    required: true,
    default: 0,
  })
  commitmentValue: number;

  @property({
    type: 'date',
  })
  commitmentStartAt?: Date;

  @property({
    type: 'date',
  })
  commitmentEndAt?: Date;

  @property({
    type: 'string',
    required: true,
    default: 'active',
    jsonSchema: {
      enum: ['active', 'stop_requested', 'stopped'],
    },
  })
  autoPayoutStatus: string;

  @property({
    type: 'date',
  })
  stopRequestedAt?: Date;

  @property({
    type: 'date',
  })
  stopEffectiveAt?: Date;

  @property({
    type: 'date',
  })
  lastProcessedWindowEndAt?: Date;

  @property({
    type: 'string',
    postgresql: {
      dataType: 'text',
    },
  })
  stopReason?: string;

  @belongsTo(() => MerchantProfiles)
  merchantProfilesId: string;

  @belongsTo(() => Users)
  usersId: string;

  @hasMany(() => MerchantPayoutBatch)
  payoutBatches: MerchantPayoutBatch[];

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

  constructor(data?: Partial<MerchantPayoutConfig>) {
    super(data);
  }
}

export interface MerchantPayoutConfigRelations { }

export type MerchantPayoutConfigWithRelations = MerchantPayoutConfig &
  MerchantPayoutConfigRelations;
