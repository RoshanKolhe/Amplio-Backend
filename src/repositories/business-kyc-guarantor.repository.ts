import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycGuarantor, BusinessKycGuarantorRelations, BusinessKyc, CompanyProfiles} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycRepository} from './business-kyc.repository';
import {CompanyProfilesRepository} from './company-profiles.repository';

export class BusinessKycGuarantorRepository extends TimeStampRepositoryMixin<
  BusinessKycGuarantor,
  typeof BusinessKycGuarantor.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycGuarantor,
      typeof BusinessKycGuarantor.prototype.id,
      BusinessKycGuarantorRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycGuarantor.prototype.id>;

  public readonly companyProfiles: BelongsToAccessor<CompanyProfiles, typeof BusinessKycGuarantor.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,) {
    super(BusinessKycGuarantor, dataSource);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
  }
}
