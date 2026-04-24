import {belongsTo, Entity, model, property} from '@loopback/repository';
import {PoolFinancials} from './pool-financials.model';
import {Spv} from './spv.model';

export type PoolSummaryStatus = {
  label: 'Active' | 'Inactive' | 'Deleted';
  isActive: boolean;
  isDeleted: boolean;
};

export type PoolSummaryTerms = {
  poolLimit: number;
  targetYield: number;
  maturityDays: number;
  reserveBufferPercent: number;
  reserveAmount: number;
  dailyCutoffTime: string | null;
};

export type PoolSummaryMetrics = {
  totalFunded: number;
  totalSettled: number;
  outstanding: number;
  remainingCapacity: number;
  utilizationPercent: number;
  reserveRequiredAmount: number;
  reserveShortfallAmount: number;
  reserveSurplusAmount: number;
  totalPoolTransactions: number;
  activePoolTransactions: number;
  settledPoolTransactions: number;
};

@model({
  settings: {
    postgresql: {
      table: 'pool_summaries',
      schema: 'public',
    },
    indexes: {
      uniquePoolSummaryBySpv: {
        keys: {spvId: 1},
        options: {unique: true},
      },
    },
  },
})
export class PoolSummary extends Entity {
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

  @property({
    type: 'date',
    required: true,
  })
  asOf: Date;

  @property({
    type: 'object',
    required: true,
    postgresql: {
      dataType: 'jsonb',
    },
  })
  status: PoolSummaryStatus;

  @property({
    type: 'object',
    required: true,
    postgresql: {
      dataType: 'jsonb',
    },
  })
  terms: PoolSummaryTerms;

  @property({
    type: 'object',
    required: true,
    postgresql: {
      dataType: 'jsonb',
    },
  })
  metrics: PoolSummaryMetrics;

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

  constructor(data?: Partial<PoolSummary>) {
    super(data);
  }
}

export interface PoolSummaryRelations {}

export type PoolSummaryWithRelations = PoolSummary & PoolSummaryRelations;
