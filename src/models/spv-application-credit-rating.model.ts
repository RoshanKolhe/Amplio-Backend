import {belongsTo, Entity, model, property} from '@loopback/repository';
import {CreditRatingAgencies} from './credit-rating-agencies.model';
import {CreditRatings} from './credit-ratings.model';
import {Media} from './media.model';
import {SpvApplication} from './spv-application.model';

@model({
  settings: {
    postgresql: {
      table: 'spv_application_credit_ratings',
      schema: 'public',
    },
    indexes: {
      uniqueSpvApplicationCreditRating: {
        keys: {spvApplicationId: 1},
        options: {unique: true},
      },
    },
  },
})
export class SpvApplicationCreditRating extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'date',
    required: true,
  })
  ratingDate: Date;

  @belongsTo(() => SpvApplication)
  spvApplicationId: string;

  @belongsTo(() => CreditRatingAgencies)
  creditRatingAgenciesId: string;

  @belongsTo(() => CreditRatings)
  creditRatingsId: string;

  @belongsTo(() => Media)
  ratingLetterId: string;

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

  constructor(data?: Partial<SpvApplicationCreditRating>) {
    super(data);
  }
}

export interface SpvApplicationCreditRatingRelations {
  spvApplication?: SpvApplication;
  creditRatingAgencies?: CreditRatingAgencies;
  creditRatings?: CreditRatings;
  ratingLetter?: Media;
}

export type SpvApplicationCreditRatingWithRelations =
  SpvApplicationCreditRating & SpvApplicationCreditRatingRelations;
