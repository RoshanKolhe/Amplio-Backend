import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycProfile, BusinessKycProfileRelations, BusinessKyc, CompanyProfiles} from '../models';
import {BusinessKycRepository} from './business-kyc.repository';
import {CompanyProfilesRepository} from './company-profiles.repository';

export class BusinessKycProfileRepository extends TimeStampRepositoryMixin<
  BusinessKycProfile,
  typeof BusinessKycProfile.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycProfile,
      typeof BusinessKycProfile.prototype.id,
      BusinessKycProfileRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycProfile.prototype.id>;

  public readonly companyProfiles: BelongsToAccessor<CompanyProfiles, typeof BusinessKycProfile.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,) {
    super(BusinessKycProfile, dataSource);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
  }
}
