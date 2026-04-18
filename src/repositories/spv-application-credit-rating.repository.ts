import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  CreditRatingAgencies,
  CreditRatings,
  Media,
  SpvApplication,
  SpvApplicationCreditRating,
  SpvApplicationCreditRatingRelations,
} from '../models';
import {CreditRatingAgenciesRepository} from './credit-rating-agencies.repository';
import {CreditRatingsRepository} from './credit-ratings.repository';
import {MediaRepository} from './media.repository';
import {SpvApplicationRepository} from './spv-application.repository';

export class SpvApplicationCreditRatingRepository extends TimeStampRepositoryMixin<
  SpvApplicationCreditRating,
  typeof SpvApplicationCreditRating.prototype.id,
  Constructor<
    DefaultCrudRepository<
      SpvApplicationCreditRating,
      typeof SpvApplicationCreditRating.prototype.id,
      SpvApplicationCreditRatingRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spvApplication: BelongsToAccessor<
    SpvApplication,
    typeof SpvApplicationCreditRating.prototype.id
  >;

  public readonly creditRatingAgencies: BelongsToAccessor<
    CreditRatingAgencies,
    typeof SpvApplicationCreditRating.prototype.id
  >;

  public readonly creditRatings: BelongsToAccessor<
    CreditRatings,
    typeof SpvApplicationCreditRating.prototype.id
  >;

  public readonly ratingLetter: BelongsToAccessor<
    Media,
    typeof SpvApplicationCreditRating.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository')
    protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
    @repository.getter('CreditRatingAgenciesRepository')
    protected creditRatingAgenciesRepositoryGetter: Getter<CreditRatingAgenciesRepository>,
    @repository.getter('CreditRatingsRepository')
    protected creditRatingsRepositoryGetter: Getter<CreditRatingsRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(SpvApplicationCreditRating, dataSource);
    this.ratingLetter = this.createBelongsToAccessorFor(
      'ratingLetter',
      mediaRepositoryGetter,
    );
    this.registerInclusionResolver(
      'ratingLetter',
      this.ratingLetter.inclusionResolver,
    );
    this.creditRatings = this.createBelongsToAccessorFor(
      'creditRatings',
      creditRatingsRepositoryGetter,
    );
    this.registerInclusionResolver(
      'creditRatings',
      this.creditRatings.inclusionResolver,
    );
    this.creditRatingAgencies = this.createBelongsToAccessorFor(
      'creditRatingAgencies',
      creditRatingAgenciesRepositoryGetter,
    );
    this.registerInclusionResolver(
      'creditRatingAgencies',
      this.creditRatingAgencies.inclusionResolver,
    );
    this.spvApplication = this.createBelongsToAccessorFor(
      'spvApplication',
      spvApplicationRepositoryGetter,
    );
    this.registerInclusionResolver(
      'spvApplication',
      this.spvApplication.inclusionResolver,
    );
  }
}
