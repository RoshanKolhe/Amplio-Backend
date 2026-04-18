import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Media} from './media.model';
import {SpvApplication} from './spv-application.model';
import {SpvKycDocumentType} from './spv-kyc-document-type.model';

@model({
  settings: {
    postgresql: {
      table: 'spv_kyc_documents',
      schema: 'public',
    },
    indexes: {
      uniqueSpvKycDocument: {
        keys: {
          spvApplicationId: 1,
          spvKycDocumentTypeId: 1,
        },
        options: {unique: true},
      },
    },
  },
})
export class SpvKycDocument extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2],
    },
    default: 0,
  })
  status: number;

  @property({
    type: 'string',
  })
  reason?: string;

  @property({
    type: 'boolean',
    default: false,
  })
  isAccepted?: boolean;

  @property({
    type: 'number',
  })
  sequenceOrder?: number;

  @property({
    type: 'string',
    default: 'pending',
    jsonSchema: {
      enum: ['pending', 'signed'],
    },
  })
  trusteeSignStatus?: string;

  @property({
    type: 'date',
  })
  trusteeSignedAt?: Date;

  @property({
    type: 'date',
  })
  verifiedAt?: Date;

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

  @belongsTo(() => SpvKycDocumentType)
  spvKycDocumentTypeId: string;

  @belongsTo(() => Media)
  mediaId?: string;

  constructor(data?: Partial<SpvKycDocument>) {
    super(data);
  }
}

export interface SpvKycDocumentRelations {
  spvApplication?: SpvApplication;
  spvKycDocumentType?: SpvKycDocumentType;
  media?: Media;
}

export type SpvKycDocumentWithRelations = SpvKycDocument &
  SpvKycDocumentRelations;
