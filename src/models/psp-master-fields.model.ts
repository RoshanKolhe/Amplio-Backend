import {Entity, model, property, belongsTo} from '@loopback/repository';
import {PspMaster} from './psp-master.model';

@model({
  settings: {
    postgresql: {
      table: 'psp_master_fields',
      schema: 'public',
    },
  },
})
export class PspMasterFields extends Entity {
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
  fieldName: string;
  // apiKey, apiSecret, webhookSecret

  @property({
    type: 'string',
    required: true,
  })
  label: string;
  // API Key, API Secret

  @property({
    type: 'string',
    jsonSchema: {
      enum: ['text', 'password', 'number'],
    },
  })
  type?: string;

  @belongsTo(() => PspMaster)
  pspMasterId: string;
  @property({
    type: 'boolean',
    default: false,
  })
  isRequired?: boolean;

  @property({
    type: 'number',
  })
  order?: number;

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

  constructor(data?: Partial<PspMasterFields>) {
    super(data);
  }
}

export interface PspMasterFieldsRelations {
  // describe navigational properties here
}

export type PspMasterFieldsWithRelations = PspMasterFields &
  PspMasterFieldsRelations;
