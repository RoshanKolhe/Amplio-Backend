import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasOneRepositoryFactory,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  Spv,
  SpvApplication,
  SpvApplicationCreditRating,
  SpvApplicationRelations,
  SpvApplicationStatusMaster,
  TrusteeProfiles,
  Users,
} from '../models';
import {SpvApplicationCreditRatingRepository} from './spv-application-credit-rating.repository';
import {SpvApplicationStatusMasterRepository} from './spv-application-status-master.repository';
import {SpvRepository} from './spv.repository';
import {TrusteeProfilesRepository} from './trustee-profiles.repository';
import {UsersRepository} from './users.repository';

export class SpvApplicationRepository extends TimeStampRepositoryMixin<
  SpvApplication,
  typeof SpvApplication.prototype.id,
  Constructor<
    DefaultCrudRepository<
      SpvApplication,
      typeof SpvApplication.prototype.id,
      SpvApplicationRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly trusteeProfiles: BelongsToAccessor<
    TrusteeProfiles,
    typeof SpvApplication.prototype.id
  >;

  public readonly users: BelongsToAccessor<Users, typeof SpvApplication.prototype.id>;

  public readonly spvApplicationStatusMaster: BelongsToAccessor<
    SpvApplicationStatusMaster,
    typeof SpvApplication.prototype.id
  >;

  public readonly spv: HasOneRepositoryFactory<
    Spv,
    typeof SpvApplication.prototype.id
  >;

  public readonly spvApplicationCreditRating: HasOneRepositoryFactory<
    SpvApplicationCreditRating,
    typeof SpvApplication.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationCreditRatingRepository')
    protected spvApplicationCreditRatingRepositoryGetter: Getter<SpvApplicationCreditRatingRepository>,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
    @repository.getter('SpvApplicationStatusMasterRepository')
    protected spvApplicationStatusMasterRepositoryGetter: Getter<SpvApplicationStatusMasterRepository>,
    @repository.getter('TrusteeProfilesRepository')
    protected trusteeProfilesRepositoryGetter: Getter<TrusteeProfilesRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(SpvApplication, dataSource);
    this.spvApplicationCreditRating = this.createHasOneRepositoryFactoryFor(
      'spvApplicationCreditRating',
      spvApplicationCreditRatingRepositoryGetter,
    );
    this.registerInclusionResolver(
      'spvApplicationCreditRating',
      this.spvApplicationCreditRating.inclusionResolver,
    );
    this.spv = this.createHasOneRepositoryFactoryFor('spv', spvRepositoryGetter);
    this.registerInclusionResolver('spv', this.spv.inclusionResolver);
    this.spvApplicationStatusMaster = this.createBelongsToAccessorFor(
      'spvApplicationStatusMaster',
      spvApplicationStatusMasterRepositoryGetter,
    );
    this.registerInclusionResolver(
      'spvApplicationStatusMaster',
      this.spvApplicationStatusMaster.inclusionResolver,
    );
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.trusteeProfiles = this.createBelongsToAccessorFor(
      'trusteeProfiles',
      trusteeProfilesRepositoryGetter,
    );
    this.registerInclusionResolver(
      'trusteeProfiles',
      this.trusteeProfiles.inclusionResolver,
    );
  }
}
