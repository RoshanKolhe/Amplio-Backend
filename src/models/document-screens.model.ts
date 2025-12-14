import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {
      table: 'document_screens',
      schema: 'public',
    },
    indexes: {
      uniqueDocumentScreen: {
        keys: {documentsId: 1, screensId: 1},
        options: {unique: true},
      },
    },
  },
})
export class DocumentScreens extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  documentsId: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  screensId: string;

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
  constructor(data?: Partial<DocumentScreens>) {
    super(data);
  }
}

export interface DocumentScreensRelations {
  // describe navigational properties here
}

export type DocumentScreensWithRelations = DocumentScreens & DocumentScreensRelations;
