import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  PoolFinancials,
  PtcIssuance,
  PtcIssuanceRelations,
  Spv,
  Transaction,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PoolFinancialsRepository} from './pool-financials.repository';
import {SpvRepository} from './spv.repository';
import {TransactionRepository} from './transaction.repository';

export class PtcIssuanceRepository extends TimeStampRepositoryMixin<
  PtcIssuance,
  typeof PtcIssuance.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PtcIssuance,
      typeof PtcIssuance.prototype.id,
      PtcIssuanceRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spv: BelongsToAccessor<Spv, typeof PtcIssuance.prototype.id>;

  public readonly poolFinancials: BelongsToAccessor<
    PoolFinancials,
    typeof PtcIssuance.prototype.id
  >;

  public readonly transaction: BelongsToAccessor<
    Transaction,
    typeof PtcIssuance.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
    @repository.getter('PoolFinancialsRepository')
    protected poolFinancialsRepositoryGetter: Getter<PoolFinancialsRepository>,
    @repository.getter('TransactionRepository')
    protected transactionRepositoryGetter: Getter<TransactionRepository>,
  ) {
    super(PtcIssuance, dataSource);
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
    this.transaction = this.createBelongsToAccessorFor(
      'transaction',
      transactionRepositoryGetter,
    );
    this.registerInclusionResolver(
      'transaction',
      this.transaction.inclusionResolver,
    );
  }
}
