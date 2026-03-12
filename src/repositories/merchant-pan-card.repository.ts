import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, HasOneRepositoryFactory, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MerchantPanCard, MerchantPanCardRelations, MerchantProfiles, Media} from '../models';
import {MediaRepository} from './media.repository';
import {MerchantProfilesRepository} from './merchant-profiles.repository';

export class MerchantPanCardRepository extends TimeStampRepositoryMixin<
  MerchantPanCard,
  typeof MerchantPanCard.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantPanCard,
      typeof MerchantPanCard.prototype.id,
      MerchantPanCardRelations
    >
  >
>(DefaultCrudRepository) {


  public readonly media: BelongsToAccessor<Media, typeof MerchantPanCard.prototype.id>;

  public readonly merchantProfiles: BelongsToAccessor<MerchantProfiles, typeof MerchantPanCard.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('MerchantProfilesRepository') protected merchantProfilesRepositoryGetter: Getter<MerchantProfilesRepository>,
  ) {
    super(MerchantPanCard, dataSource);
    this.merchantProfiles = this.createBelongsToAccessorFor('merchantProfiles', merchantProfilesRepositoryGetter,);
    this.registerInclusionResolver('merchantProfiles', this.merchantProfiles.inclusionResolver);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter,);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
  }
}
