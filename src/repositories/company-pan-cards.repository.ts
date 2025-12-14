import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {CompanyPanCards, CompanyPanCardsRelations, CompanyProfiles, Media} from '../models';
import {CompanyProfilesRepository} from './company-profiles.repository';
import {MediaRepository} from './media.repository';

export class CompanyPanCardsRepository extends TimeStampRepositoryMixin<
  CompanyPanCards,
  typeof CompanyPanCards.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CompanyPanCards,
      typeof CompanyPanCards.prototype.id,
      CompanyPanCardsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly companyProfiles: BelongsToAccessor<CompanyProfiles, typeof CompanyPanCards.prototype.id>;

  public readonly panCardDocument: BelongsToAccessor<Media, typeof CompanyPanCards.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('CompanyProfilesRepository') protected companyProfilesRepositoryGetter: Getter<CompanyProfilesRepository>, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(CompanyPanCards, dataSource);
    this.panCardDocument = this.createBelongsToAccessorFor('panCardDocument', mediaRepositoryGetter,);
    this.registerInclusionResolver('panCardDocument', this.panCardDocument.inclusionResolver);
    this.companyProfiles = this.createBelongsToAccessorFor('companyProfiles', companyProfilesRepositoryGetter,);
    this.registerInclusionResolver('companyProfiles', this.companyProfiles.inclusionResolver);
  }
}
