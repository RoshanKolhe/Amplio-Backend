import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Media} from './media.model';

@model({
  settings: {
    postgresql: {
      table: 'credit_rating_agencies',
      schema: 'public',
    },
    indexes: {
      uniqueCreditRatingAgency: {
        keys: {value: 1},
        options: {unique: true},
      },
    },
  },
})
export class CreditRatingAgencies extends Entity {
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
  })
  name: string;

  @property({
    type: 'string',
    required: true,
  })
  value: string;

  @property({
    type: 'string',
    required: true,
  })
  description: string;

  @belongsTo(() => Media)
  logoId: string;

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

  constructor(data?: Partial<CreditRatingAgencies>) {
    super(data);
  }
}

export interface CreditRatingAgenciesRelations {}

export type CreditRatingAgenciesWithRelations = CreditRatingAgencies &
  CreditRatingAgenciesRelations;
