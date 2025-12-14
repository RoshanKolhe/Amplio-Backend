import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {CompanyEntityType, CompanyEntityTypeRelations, CompanyProfiles} from '../models';
import {CompanyProfilesRepository} from './company-profiles.repository';

export class CompanyEntityTypeRepository extends TimeStampRepositoryMixin<
  CompanyEntityType,
  typeof CompanyEntityType.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CompanyEntityType,
      typeof CompanyEntityType.prototype.id,
      CompanyEntityTypeRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly companyProfiles: HasManyRepositoryFactory<CompanyProfiles, typeof CompanyEntityType.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,
  ) {
    super(CompanyEntityType, dataSource);
    this.companyProfiles = this.createHasManyRepositoryFactoryFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
  }
}
