import {
  Entity,
  model,
  property,
  belongsTo,
} from '@loopback/repository';
import {Media} from './media.model';

@model({
  settings: {
    postgresql: {
      table: 'spv_kyc_document_types',
      schema: 'public',
    },
    indexes: {
      uniqueSpvKycDocumentType: {
        keys: {value: 1},
        options: {unique: true},
      },
    },
  },
})
export class SpvKycDocumentType extends Entity {
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
  name: string;

  @property({
    type: 'string',
    required: true,
  })
  value: string;

  @property({
    type: 'string',
    required: true,
  })
  description: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['auto', 'manual', 'hybrid'],
    },
  })
  draftingMode: string;

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
  fileTemplateId: string;

  constructor(data?: Partial<SpvKycDocumentType>) {
    super(data);
  }
}

export interface SpvKycDocumentTypeRelations {
  // describe navigational properties here
}

export type SpvKycDocumentTypeWithRelations = SpvKycDocumentType &
  SpvKycDocumentTypeRelations;
