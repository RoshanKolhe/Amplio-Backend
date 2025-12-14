import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Documents} from './documents.model';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'user_uploaded_documents',
      schema: 'public',
    },
    indexes: {
      uniqueUserDocument: {
        keys: {usersId: 1, documentsId: 1, roleValue: 1, identifierId: 1},
        options: {unique: true}
      }
    },
  },
})
export class UserUploadedDocuments extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => Documents)
  documentsId: string;

  @property({
    type: 'string',
    required: true
  })
  roleValue: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  identifierId: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0=auto OCR, 1=manual team verification
    },
  })
  mode: number;   // 0 => auto, 1 => manual

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2],  // 0 => under review, 1 => approved 2 => rejected,
    },
  })
  status: number;   // 0 => under review, 1 => approved 2 => rejected,

  @property({
    type: 'string',
  })
  reason?: string; // if rejection is there

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

  @belongsTo(() => Media)
  documentsFileId: string;

  constructor(data?: Partial<UserUploadedDocuments>) {
    super(data);
  }
}

export interface UserUploadedDocumentsRelations {
  // describe navigational properties here
}

export type UserUploadedDocumentsWithRelations = UserUploadedDocuments & UserUploadedDocumentsRelations;
