import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycGuarantorVerification, BusinessKycGuarantorVerificationRelations, BusinessKycGuarantor, Media} from '../models';
import {BusinessKycGuarantorRepository} from './business-kyc-guarantor.repository';
import {MediaRepository} from './media.repository';

export class BusinessKycGuarantorVerificationRepository extends TimeStampRepositoryMixin<
  BusinessKycGuarantorVerification,
  typeof BusinessKycGuarantorVerification.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycGuarantorVerification,
      typeof BusinessKycGuarantorVerification.prototype.id,
      BusinessKycGuarantorVerificationRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKycGuarantor: BelongsToAccessor<BusinessKycGuarantor, typeof BusinessKycGuarantorVerification.prototype.id>;

  public readonly media: BelongsToAccessor<Media, typeof BusinessKycGuarantorVerification.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycGuarantorRepository') protected businessKycGuarantorRepositoryGetter: Getter<BusinessKycGuarantorRepository>, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(BusinessKycGuarantorVerification, dataSource);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter,);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
    this.businessKycGuarantor = this.createBelongsToAccessorFor('businessKycGuarantor', businessKycGuarantorRepositoryGetter,);
    this.registerInclusionResolver('businessKycGuarantor', this.businessKycGuarantor.inclusionResolver);
  }
}
