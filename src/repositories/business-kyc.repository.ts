import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKyc, BusinessKycRelations, CompanyProfiles} from '../models';
import {CompanyProfilesRepository} from './company-profiles.repository';

export class BusinessKycRepository extends TimeStampRepositoryMixin<
  BusinessKyc,
  typeof BusinessKyc.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKyc,
      typeof BusinessKyc.prototype.id,
      BusinessKycRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly companyProfiles: BelongsToAccessor<CompanyProfiles, typeof BusinessKyc.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,) {
    super(BusinessKyc, dataSource);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
  }
}
