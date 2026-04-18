import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TrustDeed, TrustDeedRelations, SpvApplication, Media} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';
import {SpvApplicationRepository} from './spv-application.repository';

export class TrustDeedRepository extends TimeStampRepositoryMixin<
  TrustDeed,
  typeof TrustDeed.prototype.id,
  Constructor<
    DefaultCrudRepository<
      TrustDeed,
      typeof TrustDeed.prototype.id,
      TrustDeedRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly spvApplication: BelongsToAccessor<SpvApplication, typeof TrustDeed.prototype.id>;
  public readonly stampDutyAndRegistration: BelongsToAccessor<Media, typeof TrustDeed.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository') protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
    @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(TrustDeed, dataSource);
    this.stampDutyAndRegistration = this.createBelongsToAccessorFor(
      'stampDutyAndRegistration',
      mediaRepositoryGetter,
    );
    this.registerInclusionResolver(
      'stampDutyAndRegistration',
      this.stampDutyAndRegistration.inclusionResolver,
    );
    this.spvApplication = this.createBelongsToAccessorFor('spvApplication', spvApplicationRepositoryGetter,);
    this.registerInclusionResolver('spvApplication', this.spvApplication.inclusionResolver);
  }
}
