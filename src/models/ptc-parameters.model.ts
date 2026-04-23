import {Entity, model, property, belongsTo} from '@loopback/repository';
import {SpvApplication} from './spv-application.model';


@model({
  settings: {
    postgresql: {
      table: 'spv_ptc_parameters',
      schema: 'public',
    },
  },
})
export class PtcParameters extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({type: 'number', required: true})
  faceValuePerUnit: number;

  @property({type: 'number', required: true})
  minInvestment: number;

  @property({type: 'number'})
  maxUnitsPerInvestor?: number;

  @property({type: 'number'})
  maxInvestors?: number;

  @property({type: 'string'})
  windowFrequency?: string;

  @property({type: 'number'})
  windowDurationHours?: number;

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

  constructor(data?: Partial<PtcParameters>) {
    super(data);
  }
}

export interface PtcParametersRelations {
  // describe navigational properties here
}

export type PtcParametersWithRelations = PtcParameters & PtcParametersRelations;
