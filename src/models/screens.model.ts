import {Entity, hasMany, model, property} from '@loopback/repository';
import {DocumentScreens} from './document-screens.model';
import {Documents} from './documents.model';

@model({
  settings: {
    postgresql: {
      table: 'screens',
      schema: 'public',
    },
    indexes: {
      uniqueScreenValue: {
        keys: {value: 1, route: 1},
        options: {unique: true},
      },
    },
  },
})
export class Screens extends Entity {
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
  })
  label: string;

  @property({
    type: 'string',
    required: true,
  })
  value: string;

  @property({
    type: 'string',
  })
  route: string;

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

  @hasMany(() => Documents, {through: {model: () => DocumentScreens}})
  documents: Documents[];

  constructor(data?: Partial<Screens>) {
    super(data);
  }
}

export interface ScreensRelations {
  // describe navigational properties here
}

export type ScreensWithRelations = Screens & ScreensRelations;
