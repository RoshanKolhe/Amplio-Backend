import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {InvestorPanCards, InvestorPanCardsRelations, Media, InvestorProfile} from '../models';
import {MediaRepository} from './media.repository';
import {InvestorProfileRepository} from './investor-profile.repository';

export class InvestorPanCardsRepository extends TimeStampRepositoryMixin<
  InvestorPanCards,
  typeof InvestorPanCards.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorPanCards,
      typeof InvestorPanCards.prototype.id,
      InvestorPanCardsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly panCardDocument: BelongsToAccessor<Media, typeof InvestorPanCards.prototype.id>;

  public readonly investorProfile: BelongsToAccessor<InvestorProfile, typeof InvestorPanCards.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('InvestorProfileRepository') protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
  ) {
    super(InvestorPanCards, dataSource);
    this.investorProfile = this.createBelongsToAccessorFor('investorProfile', investorProfileRepositoryGetter,);
    this.registerInclusionResolver('investorProfile', this.investorProfile.inclusionResolver);
    this.panCardDocument = this.createBelongsToAccessorFor('panCardDocument', mediaRepositoryGetter,);
    this.registerInclusionResolver('panCardDocument', this.panCardDocument.inclusionResolver);
  }
}
