import {Constructor, Getter, inject} from '@loopback/core';
import {BelongsToAccessor, DefaultCrudRepository, repository, HasOneRepositoryFactory, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {Media, MerchantProfiles, MerchantProfilesRelations, MerchantPanCard, MerchantDealershipType, Users, KycApplications, Psp} from '../models';
import {MediaRepository} from './media.repository';
import {MerchantPanCardRepository} from './merchant-pan-card.repository';
import {MerchantDealershipTypeRepository} from './merchant-dealership-type.repository';
import {UsersRepository} from './users.repository';
import {KycApplicationsRepository} from './kyc-applications.repository';
import {PspRepository} from './psp.repository';

export class MerchantProfilesRepository extends TimeStampRepositoryMixin<
  MerchantProfiles,
  typeof MerchantProfiles.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantProfiles,
      typeof MerchantProfiles.prototype.id,
      MerchantProfilesRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly media: BelongsToAccessor<Media, typeof MerchantProfiles.prototype.id>;

  public readonly merchantPanCard: HasOneRepositoryFactory<MerchantPanCard, typeof MerchantProfiles.prototype.id>;

  public readonly merchantDealershipType: BelongsToAccessor<MerchantDealershipType, typeof MerchantProfiles.prototype.id>;

  public readonly users: BelongsToAccessor<Users, typeof MerchantProfiles.prototype.id>;

  public readonly kycApplications: BelongsToAccessor<KycApplications, typeof MerchantProfiles.prototype.id>;

  public readonly psps: HasManyRepositoryFactory<Psp, typeof MerchantProfiles.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('MerchantPanCardRepository') protected merchantPanCardRepositoryGetter: Getter<MerchantPanCardRepository>, @repository.getter('MerchantDealershipTypeRepository') protected merchantDealershipTypeRepositoryGetter: Getter<MerchantDealershipTypeRepository>, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>, @repository.getter('KycApplicationsRepository') protected kycApplicationsRepositoryGetter: Getter<KycApplicationsRepository>, @repository.getter('PspRepository') protected pspRepositoryGetter: Getter<PspRepository>,
  ) {
    super(MerchantProfiles, dataSource);
    this.psps = this.createHasManyRepositoryFactoryFor('psps', pspRepositoryGetter,);
    this.registerInclusionResolver('psps', this.psps.inclusionResolver);
    this.kycApplications = this.createBelongsToAccessorFor('kycApplications', kycApplicationsRepositoryGetter,);
    this.registerInclusionResolver('kycApplications', this.kycApplications.inclusionResolver);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.merchantDealershipType = this.createBelongsToAccessorFor('merchantDealershipType', merchantDealershipTypeRepositoryGetter,);
    this.registerInclusionResolver('merchantDealershipType', this.merchantDealershipType.inclusionResolver);
    this.merchantPanCard = this.createHasOneRepositoryFactoryFor('merchantPanCard', merchantPanCardRepositoryGetter);
    this.registerInclusionResolver('merchantPanCard', this.merchantPanCard.inclusionResolver);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter,);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
  }
}
