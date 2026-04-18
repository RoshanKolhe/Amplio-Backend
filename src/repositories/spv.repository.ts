import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  Spv,
  SpvApplication,
  SpvRelations,
} from '../models';
import {SpvApplicationRepository} from './spv-application.repository';

export class SpvRepository extends TimeStampRepositoryMixin<
  Spv,
  typeof Spv.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Spv,
      typeof Spv.prototype.id,
      SpvRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spvApplication: BelongsToAccessor<
    SpvApplication,
    typeof Spv.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository')
    protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
  ) {
    super(Spv, dataSource);
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
