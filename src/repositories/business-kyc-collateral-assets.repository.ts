import {Constructor, inject, Getter} from '@loopback/core';
import {
  DefaultCrudRepository,
  repository,
  BelongsToAccessor,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  CollateralTypes,
  ChargeTypes,
  OwnershipTypes,
  BusinessKyc,
  CompanyProfiles,
} from '../models';
import {CollateralTypesRepository} from './collateral-types.repository';
import {ChargeTypesRepository} from './charge-types.repository';
import {OwnershipTypesRepository} from './ownership-types.repository';
import {
  BusinessKycCollateralAssets,
  BusinessKycCollateralAssetsRelations,
} from '../models/business-kyc-collateral-assets.model';
import {BusinessKycRepository} from './business-kyc.repository';
import {CompanyProfilesRepository} from './company-profiles.repository';

export class BusinessKycCollateralAssetsRepository extends TimeStampRepositoryMixin<
  BusinessKycCollateralAssets,
  typeof BusinessKycCollateralAssets.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycCollateralAssets,
      typeof BusinessKycCollateralAssets.prototype.id,
      BusinessKycCollateralAssetsRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly collateralTypes: BelongsToAccessor<
    CollateralTypes,
    typeof BusinessKycCollateralAssets.prototype.id
  >;

  public readonly chargeTypes: BelongsToAccessor<
    ChargeTypes,
    typeof BusinessKycCollateralAssets.prototype.id
  >;

  public readonly ownershipTypes: BelongsToAccessor<
    OwnershipTypes,
    typeof BusinessKycCollateralAssets.prototype.id
  >;

  public readonly businessKyc: BelongsToAccessor<
    BusinessKyc,
    typeof BusinessKycCollateralAssets.prototype.id
  >;

  public readonly companyProfiles: BelongsToAccessor<
    CompanyProfiles,
    typeof BusinessKycCollateralAssets.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('CollateralTypesRepository')
    protected collateralTypesRepositoryGetter: Getter<CollateralTypesRepository>,
    @repository.getter('ChargeTypesRepository')
    protected chargeTypesRepositoryGetter: Getter<ChargeTypesRepository>,
    @repository.getter('OwnershipTypesRepository')
    protected ownershipTypesRepositoryGetter: Getter<OwnershipTypesRepository>,
    @repository.getter('BusinessKycRepository')
    protected businessKycRepositoryGetter: Getter<BusinessKycRepository>,
    @repository.getter('CompanyProfilesRepository')
    protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,
  ) {
    super(BusinessKycCollateralAssets, dataSource);
    this.companyProfiles = this.createBelongsToAccessorFor(
      'companyProfiles',
      companyProfilesRepositoryGetter,
    );
    this.registerInclusionResolver(
      'companyProfiles',
      this.companyProfiles.inclusionResolver,
    );
    this.businessKyc = this.createBelongsToAccessorFor(
      'businessKyc',
      this.businessKycRepositoryGetter,
    );
    this.registerInclusionResolver(
      'businessKyc',
      this.businessKyc.inclusionResolver,
    );
    this.ownershipTypes = this.createBelongsToAccessorFor(
      'ownershipTypes',
      ownershipTypesRepositoryGetter,
    );
    this.registerInclusionResolver(
      'ownershipTypes',
      this.ownershipTypes.inclusionResolver,
    );
    this.chargeTypes = this.createBelongsToAccessorFor(
      'chargeTypes',
      chargeTypesRepositoryGetter,
    );
    this.registerInclusionResolver(
      'chargeTypes',
      this.chargeTypes.inclusionResolver,
    );
    this.collateralTypes = this.createBelongsToAccessorFor(
      'collateralTypes',
      collateralTypesRepositoryGetter,
    );
    this.registerInclusionResolver(
      'collateralTypes',
      this.collateralTypes.inclusionResolver,
    );
  }
}
