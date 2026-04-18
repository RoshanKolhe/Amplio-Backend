import {Entity, hasMany, model, property} from '@loopback/repository';
import {SpvApplication} from './spv-application.model';

@model({
  settings: {
    postgresql: {
      table: 'spv_application_status_master',
      schema: 'public',
    },
    indexes: {
      uniqueSpvStatusValue: {
        keys: {value: 1},
        options: {unique: true},
      },
      uniqueSpvStatusSequence: {
        keys: {sequenceOrder: 1},
        options: {unique: true},
      },
    },
  },
})
export class SpvApplicationStatusMaster extends Entity {
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
  status: string;

  @property({
    type: 'string',
    required: true,
  })
  value: string;

  @property({
    type: 'number',
    required: true,
  })
  sequenceOrder: number;

  @property({
    type: 'boolean',
    default: false,
  })
  isInitial?: boolean;

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

  @hasMany(() => SpvApplication)
  spvApplications: SpvApplication[];

  constructor(data?: Partial<SpvApplicationStatusMaster>) {
    super(data);
  }
}

export interface SpvApplicationStatusMasterRelations {}

export type SpvApplicationStatusMasterWithRelations =
  SpvApplicationStatusMaster & SpvApplicationStatusMasterRelations;
