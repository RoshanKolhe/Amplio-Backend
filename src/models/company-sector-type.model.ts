import {Entity, model, property, hasMany} from '@loopback/repository';
import {CompanyProfiles} from './company-profiles.model';

@model({
  settings: {
    postgresql: {
      table: 'company_sector_type',
      schema: 'public',
    },
    indexes: {
      uniqueSectorValue: {
        keys: {value: 1},
        options: {unique: true},
      }
    },
  },
})
export class CompanySectorType extends Entity {
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

  constructor(data?: Partial<CompanySectorType>) {
    super(data);
  }
}

export interface CompanySectorTypeRelations {
  // describe navigational properties here
}

export type CompanySectorTypeWithRelations = CompanySectorType & CompanySectorTypeRelations;
