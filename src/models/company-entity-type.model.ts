import {Entity, model, property, hasMany} from '@loopback/repository';
import {CompanyProfiles} from './company-profiles.model';

@model({
  settings: {
    postgresql: {
      table: 'company_entity_type',
      schema: 'public',
    },
    indexes: {
      uniqueEntityValue: {
        keys: {value: 1},
        options: {unique: true},
      }
    },
  },
})
export class CompanyEntityType extends Entity {
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
  label: string;

  @property({
    type: 'string',
    required: true
  })
  value: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'text'},
  })
  description?: string;

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

  @hasMany(() => CompanyProfiles)
  companyProfiles: CompanyProfiles[];

  constructor(data?: Partial<CompanyEntityType>) {
    super(data);
  }
}

export interface CompanyEntityTypeRelations {
  // describe navigational properties here
}

export type CompanyEntityTypeWithRelations = CompanyEntityType & CompanyEntityTypeRelations;
