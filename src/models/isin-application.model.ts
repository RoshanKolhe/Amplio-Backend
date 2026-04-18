import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Media} from './media.model';
import {SpvApplication} from './spv-application.model';

@model()
export class IsinApplication extends Entity {
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
    jsonSchema: {
      enum: ['nsdl', 'cdsl'],
    },
  })
  depositoryId: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['secure', 'unsecure'],
    },
  })
  securityType: string;

  @property({type: 'string', required: true})
  isinNumber: string;

  @property({type: 'string', required: true})
  issueSize: string;

  @property({type: 'date', required: true})
  issueDate: Date;

  @property({type: 'string', required: true})
  creditRating: string;

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

  @belongsTo(() => Media)
  isinLetterDocId?: string;

  constructor(data?: Partial<IsinApplication>) {
    super(data);
  }
}

export interface IsinApplicationRelations {
  isinLetterDoc?: Media;
  spvApplication?: SpvApplication;
}

export type IsinApplicationWithRelations = IsinApplication &
  IsinApplicationRelations;
