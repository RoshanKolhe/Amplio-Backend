import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  IsinApplication,
  IsinApplicationRelations,
  Media,
  SpvApplication,
} from '../models';
import {MediaRepository} from './media.repository';
import {SpvApplicationRepository} from './spv-application.repository';

export class IsinApplicationRepository extends TimeStampRepositoryMixin<
  IsinApplication,
  typeof IsinApplication.prototype.id,
  Constructor<
    DefaultCrudRepository<
      IsinApplication,
      typeof IsinApplication.prototype.id,
      IsinApplicationRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spvApplication: BelongsToAccessor<
    SpvApplication,
    typeof IsinApplication.prototype.id
  >;

  public readonly isinLetterDoc: BelongsToAccessor<
    Media,
    typeof IsinApplication.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository')
    protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(IsinApplication, dataSource);
    this.isinLetterDoc = this.createBelongsToAccessorFor(
      'isinLetterDoc',
      mediaRepositoryGetter,
    );
    this.registerInclusionResolver(
      'isinLetterDoc',
      this.isinLetterDoc.inclusionResolver,
    );
    this.spvApplication = this.createBelongsToAccessorFor(
      'spvApplication',
      spvApplicationRepositoryGetter,
    );
    this.registerInclusionResolver(
      'spvApplication',
      this.spvApplication.inclusionResolver,
    );
  }
}
