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
  CreditRatingAgenciesRelations,
  Media,
} from '../models';
import {MediaRepository} from './media.repository';

export class CreditRatingAgenciesRepository extends TimeStampRepositoryMixin<
  CreditRatingAgencies,
  typeof CreditRatingAgencies.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CreditRatingAgencies,
      typeof CreditRatingAgencies.prototype.id,
      CreditRatingAgenciesRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly logo: BelongsToAccessor<
    Media,
    typeof CreditRatingAgencies.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(CreditRatingAgencies, dataSource);
    this.logo = this.createBelongsToAccessorFor(
      'logo',
      mediaRepositoryGetter,
    );
    this.registerInclusionResolver('logo', this.logo.inclusionResolver);
  }
}
