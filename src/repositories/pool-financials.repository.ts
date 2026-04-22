import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PoolFinancials, PoolFinancialsRelations, Spv, SpvApplication} from '../models';
import {SpvApplicationRepository} from './spv-application.repository';
import {SpvRepository} from './spv.repository';

export class PoolFinancialsRepository extends TimeStampRepositoryMixin<
  PoolFinancials,
  typeof PoolFinancials.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PoolFinancials,
      typeof PoolFinancials.prototype.id,
      PoolFinancialsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly spvApplication: BelongsToAccessor<SpvApplication, typeof PoolFinancials.prototype.id>;
  public readonly spv: BelongsToAccessor<Spv, typeof PoolFinancials.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository') protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
    @repository.getter('SpvRepository') protected spvRepositoryGetter: Getter<SpvRepository>,
  ) {
    super(PoolFinancials, dataSource);
    this.spvApplication = this.createBelongsToAccessorFor('spvApplication', spvApplicationRepositoryGetter,);
    this.registerInclusionResolver('spvApplication', this.spvApplication.inclusionResolver);
    this.spv = this.createBelongsToAccessorFor('spv', spvRepositoryGetter,);
    this.registerInclusionResolver('spv', this.spv.inclusionResolver);
  }
}
