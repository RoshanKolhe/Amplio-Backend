import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycAuditedFinancials, BusinessKycAuditedFinancialsRelations, BusinessKyc, CompanyProfiles, Media} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycRepository} from './business-kyc.repository';
import {CompanyProfilesRepository} from './company-profiles.repository';
import {MediaRepository} from './media.repository';

export class BusinessKycAuditedFinancialsRepository extends TimeStampRepositoryMixin<
  BusinessKycAuditedFinancials,
  typeof BusinessKycAuditedFinancials.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycAuditedFinancials,
      typeof BusinessKycAuditedFinancials.prototype.id,
      BusinessKycAuditedFinancialsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycAuditedFinancials.prototype.id>;

  public readonly companyProfiles: BelongsToAccessor<CompanyProfiles, typeof BusinessKycAuditedFinancials.prototype.id>;

  public readonly file: BelongsToAccessor<Media, typeof BusinessKycAuditedFinancials.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,@repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>) {
    super(BusinessKycAuditedFinancials, dataSource);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
    this.file = this.createBelongsToAccessorFor('file', mediaRepositoryGetter,);
    this.registerInclusionResolver('file', this.file.inclusionResolver);
  }
}
