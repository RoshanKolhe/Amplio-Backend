import {Entity, model, property, hasMany} from '@loopback/repository';
import {Screens} from './screens.model';
import {DocumentScreens} from './document-screens.model';

@model({
  settings: {
    postgresql: {
      table: 'documents',
      schema: 'public',
    },
    indexes: {
      uniqueDocument: {
        keys: {value: 1},
        options: {unique: true},
      },
    },
  },
})
export class Documents extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
    required: true
  })
  name: string;

  @property({
    type: 'string',
    required: true
  })
  value: string;

  @property({
    type: 'string',
    required: true
  })
  description: string;

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

  @hasMany(() => Screens, {through: {model: () => DocumentScreens}})
  screens: Screens[];

  constructor(data?: Partial<Documents>) {
    super(data);
  }
}

export interface DocumentsRelations {
  // describe navigational properties here
}

export type DocumentsWithRelations = Documents & DocumentsRelations;
