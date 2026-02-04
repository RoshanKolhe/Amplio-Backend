import {Constructor, Getter, inject} from '@loopback/core';
import {BelongsToAccessor, DefaultCrudRepository, HasOneRepositoryFactory, repository, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {CompanyPanCards, CompanyProfiles, CompanyProfilesRelations, Media, Users, CompanyEntityType, CompanySectorType, KycApplications, BusinessKyc, BusinessKycProfile, BusinessKycAuditedFinancials, BusinessKycGuarantor, BusinessKycCollateralAssets, BusinessKycAgreement} from '../models';
import {CompanyPanCardsRepository} from './company-pan-cards.repository';
import {KycApplicationsRepository} from './kyc-applications.repository';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';
import {CompanyEntityTypeRepository} from './company-entity-type.repository';
import {CompanySectorTypeRepository} from './company-sector-type.repository';
import {BusinessKycRepository} from './business-kyc.repository';
import {BusinessKycProfileRepository} from './business-kyc-profile.repository';
import {BusinessKycAuditedFinancialsRepository} from './business-kyc-audited-financials.repository';
import {BusinessKycGuarantorRepository} from './business-kyc-guarantor.repository';
import {BusinessKycCollateralAssetsRepository} from './business-kyc-collateral-assets.repository';
import {BusinessKycAgreementRepository} from './business-kyc-agreement.repository';

export class CompanyProfilesRepository extends TimeStampRepositoryMixin<
  CompanyProfiles,
  typeof CompanyProfiles.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CompanyProfiles,
      typeof CompanyProfiles.prototype.id,
      CompanyProfilesRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly companyLogoData: BelongsToAccessor<Media, typeof CompanyProfiles.prototype.id>;

  public readonly companyPanCards: HasOneRepositoryFactory<CompanyPanCards, typeof CompanyProfiles.prototype.id>;

  public readonly users: BelongsToAccessor<Users, typeof CompanyProfiles.prototype.id>;

  public readonly companyEntityType: BelongsToAccessor<CompanyEntityType, typeof CompanyProfiles.prototype.id>;

  public readonly companySectorType: BelongsToAccessor<CompanySectorType, typeof CompanyProfiles.prototype.id>;

  public readonly kycApplications: BelongsToAccessor<KycApplications, typeof CompanyProfiles.prototype.id>;

  public readonly businessKyc: HasOneRepositoryFactory<BusinessKyc, typeof CompanyProfiles.prototype.id>;

  public readonly businessKycProfile: HasOneRepositoryFactory<BusinessKycProfile, typeof CompanyProfiles.prototype.id>;

  public readonly businessKycAuditedFinancials: HasManyRepositoryFactory<BusinessKycAuditedFinancials, typeof CompanyProfiles.prototype.id>;

  public readonly businessKycGuarantors: HasManyRepositoryFactory<BusinessKycGuarantor, typeof CompanyProfiles.prototype.id>;

  public readonly businessKycCollateralAssets: HasManyRepositoryFactory<BusinessKycCollateralAssets, typeof CompanyProfiles.prototype.id>;

  public readonly businessKycAgreement: HasOneRepositoryFactory<BusinessKycAgreement, typeof CompanyProfiles.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('CompanyPanCardsRepository') protected companyPanCardsRepositoryGetter: Getter<CompanyPanCardsRepository>, @repository.getter('KycApplicationsRepository') protected kycApplicationsRepositoryGetter: Getter<KycApplicationsRepository>, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>, @repository.getter('CompanyEntityTypeRepository') protected companyEntityTypeRepositoryGetter: Getter<CompanyEntityTypeRepository>, @repository.getter('CompanySectorTypeRepository') protected companySectorTypeRepositoryGetter: Getter<CompanySectorTypeRepository>, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>, @repository.getter('BusinessKycProfileRepository') protected businessKycProfileRepositoryGetter: Getter<BusinessKycProfileRepository>, @repository.getter('BusinessKycAuditedFinancialsRepository') protected businessKycAuditedFinancialsRepositoryGetter: Getter<BusinessKycAuditedFinancialsRepository>, @repository.getter('BusinessKycGuarantorRepository') protected businessKycGuarantorRepositoryGetter: Getter<BusinessKycGuarantorRepository>, @repository.getter('BusinessKycCollateralAssetsRepository') protected businessKycCollateralAssetsRepositoryGetter: Getter<BusinessKycCollateralAssetsRepository>, @repository.getter('BusinessKycAgreementRepository') protected businessKycAgreementRepositoryGetter: Getter<BusinessKycAgreementRepository>,
  ) {
    super(CompanyProfiles, dataSource);
    this.businessKycAgreement = this.createHasOneRepositoryFactoryFor('businessKycAgreement', businessKycAgreementRepositoryGetter);
    this.registerInclusionResolver('businessKycAgreement', this.businessKycAgreement.inclusionResolver);
    this.businessKycCollateralAssets = this.createHasManyRepositoryFactoryFor('businessKycCollateralAssets', businessKycCollateralAssetsRepositoryGetter,);
    this.registerInclusionResolver('businessKycCollateralAssets', this.businessKycCollateralAssets.inclusionResolver);
    this.businessKycGuarantors = this.createHasManyRepositoryFactoryFor('businessKycGuarantors', businessKycGuarantorRepositoryGetter,);
    this.registerInclusionResolver('businessKycGuarantors', this.businessKycGuarantors.inclusionResolver);
    this.businessKycAuditedFinancials = this.createHasManyRepositoryFactoryFor('businessKycAuditedFinancials', businessKycAuditedFinancialsRepositoryGetter,);
    this.registerInclusionResolver('businessKycAuditedFinancials', this.businessKycAuditedFinancials.inclusionResolver);
    this.businessKycProfile = this.createHasOneRepositoryFactoryFor('businessKycProfile', businessKycProfileRepositoryGetter);
    this.registerInclusionResolver('businessKycProfile', this.businessKycProfile.inclusionResolver);
    this.businessKyc = this.createHasOneRepositoryFactoryFor('businessKyc', businessKycRepositoryGetter);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
    this.kycApplications = this.createBelongsToAccessorFor('kycApplications', kycApplicationsRepositoryGetter,);
    this.registerInclusionResolver('kycApplications', this.kycApplications.inclusionResolver);
    this.companySectorType = this.createBelongsToAccessorFor('companySectorType', companySectorTypeRepositoryGetter,);
    this.registerInclusionResolver('companySectorType', this.companySectorType.inclusionResolver);
    this.companyEntityType = this.createBelongsToAccessorFor('companyEntityType', companyEntityTypeRepositoryGetter,);
    this.registerInclusionResolver('companyEntityType', this.companyEntityType.inclusionResolver);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.companyPanCards = this.createHasOneRepositoryFactoryFor('companyPanCards', companyPanCardsRepositoryGetter);
    this.registerInclusionResolver('companyPanCards', this.companyPanCards.inclusionResolver);
    this.companyLogoData = this.createBelongsToAccessorFor('companyLogoData', mediaRepositoryGetter,);
    this.registerInclusionResolver('companyLogoData', this.companyLogoData.inclusionResolver);
  }
}
