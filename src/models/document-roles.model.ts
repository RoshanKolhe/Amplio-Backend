import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {
      table: 'document_roles',
      schema: 'public',
    },
    indexes: {
      uniqueDocumentRoles: {
        keys: {rolesId: 1, documentTypesId: 1},
        options: {unique: true},
      },
    },
  },
})
export class DocumentRoles extends Entity {
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
  rolesId: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  documentTypesId: string;

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
  constructor(data?: Partial<DocumentRoles>) {
    super(data);
  }
}

export interface DocumentRolesRelations {
  // describe navigational properties here
}

export type DocumentRolesWithRelations = DocumentRoles & DocumentRolesRelations;
