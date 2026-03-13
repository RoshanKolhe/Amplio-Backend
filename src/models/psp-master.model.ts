import {
  Entity,
  model,
  property,
  belongsTo,
  hasMany,
} from '@loopback/repository';
import {Media} from './media.model';
import {PspMasterFields} from './psp-master-fields.model';

@model({
  settings: {
    postgresql: {
      table: 'psp_master',
      schema: 'public',
    },
  },
})
export class PspMaster extends Entity {
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
  name: string; // Razorpay

  @property({
    type: 'string',
    required: true,
  })
  value: string; // razorpay

  @property({
    type: 'string',
  })
  description?: string;

  @property({
    type: 'number',
    jsonSchema: {
      enum: [0, 1], // 0 inactive 1 active
    },
    default: 1,
  })
  status?: number;

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

  @belongsTo(() => Media)
  logoMediaId: string;

  @hasMany(() => PspMasterFields)
  pspMasterFields: PspMasterFields[];

  constructor(data?: Partial<PspMaster>) {
    super(data);
  }
}

export interface PspMasterRelations {
  // describe navigational properties here
  logoMedia?: Media;
  pspMasterFields?: PspMasterFields[];
}

export type PspMasterWithRelations = PspMaster & PspMasterRelations;
