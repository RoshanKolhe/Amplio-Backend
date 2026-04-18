import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PoolFinancials, PoolFinancialsRelations, SpvApplication} from '../models';
import {SpvApplicationRepository} from './spv-application.repository';

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

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('SpvApplicationRepository') protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
  ) {
    super(PoolFinancials, dataSource);
    this.spvApplication = this.createBelongsToAccessorFor('spvApplication', spvApplicationRepositoryGetter,);
    this.registerInclusionResolver('spvApplication', this.spvApplication.inclusionResolver);
  }
}
