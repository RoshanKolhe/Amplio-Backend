import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  HasOneRepositoryFactory,
  repository,
} from '@loopback/repository';

import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

import {
  BusinessKyc,
  BusinessKycClientProfile,
  BusinessKycCollateralAssets,
  BusinessKycGuarantor,
  BusinessKycProfile,
  BusinessKycRelations,
  BusinessKycStatusMaster,
  CompanyProfiles, BusinessKycAuditedFinancials, BusinessKycAgreement, Roc, BusinessKycDpn} from '../models';

import {BusinessKycClientProfileRepository} from './business-kyc-client-profile.repository';
import {BusinessKycCollateralAssetsRepository} from './business-kyc-collateral-assets.repository';
import {BusinessKycGuarantorRepository} from './business-kyc-guarantor.repository';
import {BusinessKycProfileRepository} from './business-kyc-profile.repository';
import {BusinessKycStatusMasterRepository} from './business-kyc-status-master.repository';
import {CompanyProfilesRepository} from './company-profiles.repository';
import {BusinessKycAuditedFinancialsRepository} from './business-kyc-audited-financials.repository';
import {BusinessKycAgreementRepository} from './business-kyc-agreement.repository';
import {RocRepository} from './roc.repository';
import {BusinessKycDpnRepository} from './business-kyc-dpn.repository';

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
  public readonly companyProfiles: BelongsToAccessor<
    CompanyProfiles,
    typeof BusinessKyc.prototype.id
  >;

  public readonly businessKycStatusMaster: BelongsToAccessor<
    BusinessKycStatusMaster,
    typeof BusinessKyc.prototype.id
  >;

  public readonly businessKycProfile: HasOneRepositoryFactory<
    BusinessKycProfile,
    typeof BusinessKyc.prototype.id
  >;

  public readonly businessKycCollateralAssets: HasManyRepositoryFactory<
    BusinessKycCollateralAssets,
    typeof BusinessKyc.prototype.id
  >;

  public readonly businessKycClientProfiles: HasManyRepositoryFactory<
    BusinessKycClientProfile,
    typeof BusinessKyc.prototype.id
  >;

  public readonly businessKycGuarantors: HasManyRepositoryFactory<
    BusinessKycGuarantor,
    typeof BusinessKyc.prototype.id
  >;

  public readonly businessKycAuditedFinancials: HasManyRepositoryFactory<BusinessKycAuditedFinancials, typeof BusinessKyc.prototype.id>;

  public readonly businessKycAgreement: HasOneRepositoryFactory<BusinessKycAgreement, typeof BusinessKyc.prototype.id>;

  public readonly roc: HasOneRepositoryFactory<Roc, typeof BusinessKyc.prototype.id>;

  public readonly businessKycDpn: HasOneRepositoryFactory<BusinessKycDpn, typeof BusinessKyc.prototype.id>;

  constructor(
    @inject('datasources.amplio')
    dataSource: AmplioDataSource,

    @repository.getter('CompanyProfilesRepository')
    protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,

    @repository.getter('BusinessKycStatusMasterRepository')
    protected businessKycStatusMasterRepositoryGetter: Getter<BusinessKycStatusMasterRepository>,

    @repository.getter('BusinessKycProfileRepository')
    protected businessKycProfileRepositoryGetter: Getter<BusinessKycProfileRepository>,

    @repository.getter('BusinessKycCollateralAssetsRepository')
    protected businessKycCollateralAssetsRepositoryGetter: Getter<BusinessKycCollateralAssetsRepository>,

    @repository.getter('BusinessKycClientProfileRepository')
    protected businessKycClientProfileRepositoryGetter: Getter<BusinessKycClientProfileRepository>,

    @repository.getter('BusinessKycGuarantorRepository')
    protected businessKycGuarantorRepositoryGetter: Getter<BusinessKycGuarantorRepository>, @repository.getter('BusinessKycAuditedFinancialsRepository') protected businessKycAuditedFinancialsRepositoryGetter: Getter<BusinessKycAuditedFinancialsRepository>, @repository.getter('BusinessKycAgreementRepository') protected businessKycAgreementRepositoryGetter: Getter<BusinessKycAgreementRepository>, @repository.getter('RocRepository') protected rocRepositoryGetter: Getter<RocRepository>, @repository.getter('BusinessKycDpnRepository') protected businessKycDpnRepositoryGetter: Getter<BusinessKycDpnRepository>,
  ) {
    super(BusinessKyc, dataSource);
    this.businessKycDpn = this.createHasOneRepositoryFactoryFor('businessKycDpn', businessKycDpnRepositoryGetter);
    this.registerInclusionResolver('businessKycDpn', this.businessKycDpn.inclusionResolver);
    this.roc = this.createHasOneRepositoryFactoryFor('roc', rocRepositoryGetter);
    this.registerInclusionResolver('roc', this.roc.inclusionResolver);
    this.businessKycAgreement = this.createHasOneRepositoryFactoryFor('businessKycAgreement', businessKycAgreementRepositoryGetter);
    this.registerInclusionResolver('businessKycAgreement', this.businessKycAgreement.inclusionResolver);
    this.businessKycAuditedFinancials = this.createHasManyRepositoryFactoryFor('businessKycAuditedFinancials', businessKycAuditedFinancialsRepositoryGetter,);
    this.registerInclusionResolver('businessKycAuditedFinancials', this.businessKycAuditedFinancials.inclusionResolver);

    // belongsTo
    this.companyProfiles = this.createBelongsToAccessorFor(
      'companyProfiles',
      companyProfilesRepositoryGetter,
    );
    this.registerInclusionResolver(
      'companyProfiles',
      this.companyProfiles.inclusionResolver,
    );

    this.businessKycStatusMaster = this.createBelongsToAccessorFor(
      'businessKycStatusMaster',
      businessKycStatusMasterRepositoryGetter,
    );
    this.registerInclusionResolver(
      'businessKycStatusMaster',
      this.businessKycStatusMaster.inclusionResolver,
    );

    // hasOne
    this.businessKycProfile = this.createHasOneRepositoryFactoryFor(
      'businessKycProfile',
      businessKycProfileRepositoryGetter,
    );
    this.registerInclusionResolver(
      'businessKycProfile',
      this.businessKycProfile.inclusionResolver,
    );

    // hasMany
    this.businessKycCollateralAssets =
      this.createHasManyRepositoryFactoryFor(
        'businessKycCollateralAssets',
        businessKycCollateralAssetsRepositoryGetter,
      );
    this.registerInclusionResolver(
      'businessKycCollateralAssets',
      this.businessKycCollateralAssets.inclusionResolver,
    );

    this.businessKycClientProfiles =
      this.createHasManyRepositoryFactoryFor(
        'businessKycClientProfiles',
        businessKycClientProfileRepositoryGetter,
      );

    this.registerInclusionResolver(
      'businessKycClientProfiles',
      this.businessKycClientProfiles.inclusionResolver,
    );

    this.businessKycGuarantors =
      this.createHasManyRepositoryFactoryFor(
        'businessKycGuarantors',
        businessKycGuarantorRepositoryGetter,
      );
    this.registerInclusionResolver(
      'businessKycGuarantors',
      this.businessKycGuarantors.inclusionResolver,
    );
  }
}
