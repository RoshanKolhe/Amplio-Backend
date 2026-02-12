import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycDpn, BusinessKycDpnRelations, BusinessKyc, CompanyProfiles, BusinessKycDocumentType, Media} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycRepository} from './business-kyc.repository';
import {CompanyProfilesRepository} from './company-profiles.repository';
import {BusinessKycDocumentTypeRepository} from './business-kyc-document-type.repository';
import {MediaRepository} from './media.repository';

export class BusinessKycDpnRepository extends TimeStampRepositoryMixin<
  BusinessKycDpn,
  typeof BusinessKycDpn.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycDpn,
      typeof BusinessKycDpn.prototype.id,
      BusinessKycDpnRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycDpn.prototype.id>;

  public readonly companyProfiles: BelongsToAccessor<CompanyProfiles, typeof BusinessKycDpn.prototype.id>;

  public readonly businessKycDocumentType: BelongsToAccessor<BusinessKycDocumentType, typeof BusinessKycDpn.prototype.id>;

  public readonly media: BelongsToAccessor<Media, typeof BusinessKycDpn.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>, @repository.getter('BusinessKycDocumentTypeRepository') protected businessKycDocumentTypeRepositoryGetter: Getter<BusinessKycDocumentTypeRepository>, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,) {
    super(BusinessKycDpn, dataSource);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter,);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
    this.businessKycDocumentType = this.createBelongsToAccessorFor('businessKycDocumentType', businessKycDocumentTypeRepositoryGetter,);
    this.registerInclusionResolver('businessKycDocumentType', this.businessKycDocumentType.inclusionResolver);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
  }
}
