import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TrusteeEntityTypes, TrusteeEntityTypesRelations, TrusteeProfiles} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {TrusteeProfilesRepository} from './trustee-profiles.repository';

export class TrusteeEntityTypesRepository extends TimeStampRepositoryMixin<
  TrusteeEntityTypes,
  typeof TrusteeEntityTypes.prototype.id,
  Constructor<
    DefaultCrudRepository<
      TrusteeEntityTypes,
      typeof TrusteeEntityTypes.prototype.id,
      TrusteeEntityTypesRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly trusteeProfiles: HasManyRepositoryFactory<TrusteeProfiles, typeof TrusteeEntityTypes.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('TrusteeProfilesRepository') protected trusteeProfilesRepositoryGetter: Getter<TrusteeProfilesRepository>,
  ) {
    super(TrusteeEntityTypes, dataSource);
    this.trusteeProfiles = this.createHasManyRepositoryFactoryFor('trusteeProfiles', trusteeProfilesRepositoryGetter,);
    this.registerInclusionResolver('trusteeProfiles', this.trusteeProfiles.inclusionResolver);
  }
}
