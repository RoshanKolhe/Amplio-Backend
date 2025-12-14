import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {TrusteePanCards, TrusteePanCardsRelations, Media, TrusteeProfiles} from '../models';
import {MediaRepository} from './media.repository';
import {TrusteeProfilesRepository} from './trustee-profiles.repository';

export class TrusteePanCardsRepository extends TimeStampRepositoryMixin<
  TrusteePanCards,
  typeof TrusteePanCards.prototype.id,
  Constructor<
    DefaultCrudRepository<
      TrusteePanCards,
      typeof TrusteePanCards.prototype.id,
      TrusteePanCardsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly panCardDocument: BelongsToAccessor<Media, typeof TrusteePanCards.prototype.id>;

  public readonly trusteeProfiles: BelongsToAccessor<TrusteeProfiles, typeof TrusteePanCards.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('TrusteeProfilesRepository') protected trusteeProfilesRepositoryGetter: Getter<TrusteeProfilesRepository>,
  ) {
    super(TrusteePanCards, dataSource);
    this.trusteeProfiles = this.createBelongsToAccessorFor('trusteeProfiles', trusteeProfilesRepositoryGetter,);
    this.registerInclusionResolver('trusteeProfiles', this.trusteeProfiles.inclusionResolver);
    this.panCardDocument = this.createBelongsToAccessorFor('panCardDocument', mediaRepositoryGetter,);
    this.registerInclusionResolver('panCardDocument', this.panCardDocument.inclusionResolver);
  }
}
