import {
  belongsTo,
  Entity,
  model,
  property,
} from '@loopback/repository';
import {PspMaster} from './psp-master.model';
import {SpvApplication} from './spv-application.model';

@model({
  settings: {
    postgresql: {
      table: 'spv',
      schema: 'public',
    },
  },
})
export class Spv extends Entity {

  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
    required: true,
  })
  legalStructure: string;

  @belongsTo(() => PspMaster)
  pspMasterId: string;

  @property({
    type: 'string',
    required: true,
  })
  originatorName: string;

  @property({
    type: 'string',
    required: true,
  })
  spvName: string;

  @belongsTo(() => SpvApplication)
  spvApplicationId: string;

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


  constructor(data?: Partial<Spv>) {
    super(data);
  }
}

export interface SpvRelations {
  spvApplication?: SpvApplication;
  pspMaster?: PspMaster;
}

export type SpvWithRelations = Spv & SpvRelations;
