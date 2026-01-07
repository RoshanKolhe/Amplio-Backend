import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor, HasOneRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {InvestorProfile, InvestorProfileRelations, Media, InvestorPanCards, Users, KycApplications} from '../models';
import {MediaRepository} from './media.repository';
import {InvestorPanCardsRepository} from './investor-pan-cards.repository';
import {UsersRepository} from './users.repository';
import {KycApplicationsRepository} from './kyc-applications.repository';

export class InvestorProfileRepository extends TimeStampRepositoryMixin<
  InvestorProfile,
  typeof InvestorProfile.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorProfile,
      typeof InvestorProfile.prototype.id,
      InvestorProfileRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly aadharFrontImage: BelongsToAccessor<Media, typeof InvestorProfile.prototype.id>;

  public readonly aadharBackImage: BelongsToAccessor<Media, typeof InvestorProfile.prototype.id>;

  public readonly selfie: BelongsToAccessor<Media, typeof InvestorProfile.prototype.id>;

  public readonly investorPanCards: HasOneRepositoryFactory<InvestorPanCards, typeof InvestorProfile.prototype.id>;

  public readonly users: BelongsToAccessor<Users, typeof InvestorProfile.prototype.id>;

  public readonly kycApplications: BelongsToAccessor<KycApplications, typeof InvestorProfile.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('InvestorPanCardsRepository') protected investorPanCardsRepositoryGetter: Getter<InvestorPanCardsRepository>, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>, @repository.getter('KycApplicationsRepository') protected kycApplicationsRepositoryGetter: Getter<KycApplicationsRepository>,
  ) {
    super(InvestorProfile, dataSource);
    this.kycApplications = this.createBelongsToAccessorFor('kycApplications', kycApplicationsRepositoryGetter,);
    this.registerInclusionResolver('kycApplications', this.kycApplications.inclusionResolver);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.investorPanCards = this.createHasOneRepositoryFactoryFor('investorPanCards', investorPanCardsRepositoryGetter);
    this.registerInclusionResolver('investorPanCards', this.investorPanCards.inclusionResolver);
    this.selfie = this.createBelongsToAccessorFor('selfie', mediaRepositoryGetter,);
    this.registerInclusionResolver('selfie', this.selfie.inclusionResolver);
    this.aadharBackImage = this.createBelongsToAccessorFor('aadharBackImage', mediaRepositoryGetter,);
    this.registerInclusionResolver('aadharBackImage', this.aadharBackImage.inclusionResolver);
    this.aadharFrontImage = this.createBelongsToAccessorFor('aadharFrontImage', mediaRepositoryGetter,);
    this.registerInclusionResolver('aadharFrontImage', this.aadharFrontImage.inclusionResolver);
  }
}
