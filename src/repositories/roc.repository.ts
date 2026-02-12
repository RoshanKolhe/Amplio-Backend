import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {Roc, RocRelations, Media, BusinessKyc, BusinessKycDocumentType, CompanyProfiles} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';
import {BusinessKycRepository} from './business-kyc.repository';
import {BusinessKycDocumentTypeRepository} from './business-kyc-document-type.repository';
import {CompanyProfilesRepository} from './company-profiles.repository';

export class RocRepository extends TimeStampRepositoryMixin<
  Roc,
  typeof Roc.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Roc,
      typeof Roc.prototype.id,
      RocRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly chargeFiling: BelongsToAccessor<Media, typeof Roc.prototype.id>;

  public readonly backupSecurity: BelongsToAccessor<Media, typeof Roc.prototype.id>;

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof Roc.prototype.id>;

  public readonly businessKycDocumentType: BelongsToAccessor<BusinessKycDocumentType, typeof Roc.prototype.id>;

  public readonly companyProfiles: BelongsToAccessor<CompanyProfiles, typeof Roc.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>, @repository.getter('BusinessKycDocumentTypeRepository') protected businessKycDocumentTypeRepositoryGetter: Getter<BusinessKycDocumentTypeRepository>, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>,
  ) {
    super(Roc, dataSource);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
    this.businessKycDocumentType = this.createBelongsToAccessorFor('businessKycDocumentType', businessKycDocumentTypeRepositoryGetter,);
    this.registerInclusionResolver('businessKycDocumentType', this.businessKycDocumentType.inclusionResolver);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
    this.backupSecurity = this.createBelongsToAccessorFor('backupSecurity', mediaRepositoryGetter,);
    this.registerInclusionResolver('backupSecurity', this.backupSecurity.inclusionResolver);
    this.chargeFiling = this.createBelongsToAccessorFor('chargeFiling', mediaRepositoryGetter,);
    this.registerInclusionResolver('chargeFiling', this.chargeFiling.inclusionResolver);
  }
}
