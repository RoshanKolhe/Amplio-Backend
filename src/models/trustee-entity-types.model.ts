import {Entity, model, property, hasMany} from '@loopback/repository';
import {TrusteeProfiles} from './trustee-profiles.model';

@model({
  settings: {
    postgresql: {
      table: 'trustee_entity_type',
      schema: 'public',
    },
    indexes: {
      uniqueTrusteeEntityValue: {
        keys: {value: 1},
        options: {unique: true},
      }
    },
  },
})
export class TrusteeEntityTypes extends Entity {
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

  @hasMany(() => TrusteeProfiles)
  trusteeProfiles: TrusteeProfiles[];

  constructor(data?: Partial<TrusteeEntityTypes>) {
    super(data);
  }
}

export interface TrusteeEntityTypesRelations {
  // describe navigational properties here
}

export type TrusteeEntityTypesWithRelations = TrusteeEntityTypes & TrusteeEntityTypesRelations;
