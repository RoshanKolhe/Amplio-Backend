import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor, HasOneRepositoryFactory, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKyc, BusinessKycRelations, CompanyProfiles, BusinessKycProfile, BusinessKycAuditedFinancials, BusinessKycCollateralAssets, BusinessKycClientProfile, BusinessKycGuarantor} from '../models';
import {CompanyProfilesRepository} from './company-profiles.repository';
import {BusinessKycProfileRepository} from './business-kyc-profile.repository';
import {BusinessKycAuditedFinancialsRepository} from './business-kyc-audited-financials.repository';
import {BusinessKycCollateralAssetsRepository} from './business-kyc-collateral-assets.repository';
import {BusinessKycClientProfileRepository} from './business-kyc-client-profile.repository';
import {BusinessKycGuarantorRepository} from './business-kyc-guarantor.repository';

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

  public readonly businessKycProfile: HasOneRepositoryFactory<BusinessKycProfile, typeof BusinessKyc.prototype.id>;

  public readonly businessKycAuditedFinancials: HasOneRepositoryFactory<BusinessKycAuditedFinancials, typeof BusinessKyc.prototype.id>;

  public readonly businessKycCollateralAssets: HasManyRepositoryFactory<BusinessKycCollateralAssets, typeof BusinessKyc.prototype.id>;

  public readonly businessKycClientProfiles: HasManyRepositoryFactory<BusinessKycClientProfile, typeof BusinessKyc.prototype.id>;

  public readonly businessKycGuarantors: HasManyRepositoryFactory<BusinessKycGuarantor, typeof BusinessKyc.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>, @repository.getter('BusinessKycProfileRepository') protected businessKycProfileRepositoryGetter: Getter<BusinessKycProfileRepository>, @repository.getter('BusinessKycAuditedFinancialsRepository') protected businessKycAuditedFinancialsRepositoryGetter: Getter<BusinessKycAuditedFinancialsRepository>, @repository.getter('BusinessKycCollateralAssetsRepository') protected businessKycCollateralAssetsRepositoryGetter: Getter<BusinessKycCollateralAssetsRepository>, @repository.getter('BusinessKycClientProfileRepository') protected businessKycClientProfileRepositoryGetter: Getter<BusinessKycClientProfileRepository>, @repository.getter('BusinessKycGuarantorRepository') protected businessKycGuarantorRepositoryGetter: Getter<BusinessKycGuarantorRepository>,) {
    super(BusinessKyc, dataSource);
    this.businessKycGuarantors = this.createHasManyRepositoryFactoryFor('businessKycGuarantors', businessKycGuarantorRepositoryGetter,);
    this.registerInclusionResolver('businessKycGuarantors', this.businessKycGuarantors.inclusionResolver);
    this.businessKycClientProfiles = this.createHasManyRepositoryFactoryFor('businessKycClientProfiles', businessKycClientProfileRepositoryGetter,);
    this.registerInclusionResolver('businessKycClientProfiles', this.businessKycClientProfiles.inclusionResolver);
    this.businessKycCollateralAssets = this.createHasManyRepositoryFactoryFor('businessKycCollateralAssets', businessKycCollateralAssetsRepositoryGetter,);
    this.registerInclusionResolver('businessKycCollateralAssets', this.businessKycCollateralAssets.inclusionResolver);
    this.businessKycAuditedFinancials = this.createHasOneRepositoryFactoryFor('businessKycAuditedFinancials', businessKycAuditedFinancialsRepositoryGetter);
    this.registerInclusionResolver('businessKycAuditedFinancials', this.businessKycAuditedFinancials.inclusionResolver);
    this.businessKycProfile = this.createHasOneRepositoryFactoryFor('businessKycProfile', businessKycProfileRepositoryGetter);
    this.registerInclusionResolver('businessKycProfile', this.businessKycProfile.inclusionResolver);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
  }
}
