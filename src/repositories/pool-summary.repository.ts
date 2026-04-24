import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  PoolFinancials,
  PoolSummary,
  PoolSummaryRelations,
  Spv,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PoolFinancialsRepository} from './pool-financials.repository';
import {SpvRepository} from './spv.repository';

export class PoolSummaryRepository extends TimeStampRepositoryMixin<
  PoolSummary,
  typeof PoolSummary.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PoolSummary,
      typeof PoolSummary.prototype.id,
      PoolSummaryRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spv: BelongsToAccessor<Spv, typeof PoolSummary.prototype.id>;

  public readonly poolFinancials: BelongsToAccessor<
    PoolFinancials,
    typeof PoolSummary.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
    @repository.getter('PoolFinancialsRepository')
    protected poolFinancialsRepositoryGetter: Getter<PoolFinancialsRepository>,
  ) {
    super(PoolSummary, dataSource);
    this.spv = this.createBelongsToAccessorFor('spv', spvRepositoryGetter);
    this.registerInclusionResolver('spv', this.spv.inclusionResolver);
    this.poolFinancials = this.createBelongsToAccessorFor(
      'poolFinancials',
      poolFinancialsRepositoryGetter,
    );
    this.registerInclusionResolver(
      'poolFinancials',
      this.poolFinancials.inclusionResolver,
    );
  }
}
