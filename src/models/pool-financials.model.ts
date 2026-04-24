import {belongsTo, Entity, model, property} from '@loopback/repository';
import {EscrowSetup} from './escrow-setup.model';
import {SpvApplication} from './spv-application.model';
import {Spv} from './spv.model';


@model({
  settings: {
    postgresql: {
      table: 'spv_pool_financials',
      schema: 'public',
    },
  },
})
export class PoolFinancials extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  poolLimit: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  maturityDays: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  targetYield: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  reserveBufferPercent: number;

  @property({
    type: 'number',
    postgresql: {
      dataType: 'float'
    }
  })
  reserveAmount?: number;

  @property({
    type: 'number',
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  totalFunded?: number;

  @property({
    type: 'number',
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  totalSettled?: number;

  @property({
    type: 'number',
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  outstanding?: number;

  @property({
    type: 'string'
  })
  dailyCutoffTime?: string;

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

  @belongsTo(() => SpvApplication)
  spvApplicationId: string;

  @belongsTo(() => Spv)
  spvId?: string;

  @belongsTo(() => EscrowSetup)
  escrowSetupId?: string;

  constructor(data?: Partial<PoolFinancials>) {
    super(data);
  }
}

export interface PoolFinancialsRelations {
  // describe navigational properties here
}

export type PoolFinancialsWithRelations = PoolFinancials & PoolFinancialsRelations;
