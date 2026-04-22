import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  PoolTransaction,
  PoolTransactionRelations,
  Spv,
  Transaction,
} from '../models';
import {SpvRepository} from './spv.repository';
import {TransactionRepository} from './transaction.repository';

export class PoolTransactionRepository extends TimeStampRepositoryMixin<
  PoolTransaction,
  typeof PoolTransaction.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PoolTransaction,
      typeof PoolTransaction.prototype.id,
      PoolTransactionRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly transaction: BelongsToAccessor<
    Transaction,
    typeof PoolTransaction.prototype.id
  >;

  public readonly spv: BelongsToAccessor<Spv, typeof PoolTransaction.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('TransactionRepository')
    protected transactionRepositoryGetter: Getter<TransactionRepository>,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
  ) {
    super(PoolTransaction, dataSource);
    this.transaction = this.createBelongsToAccessorFor(
      'transaction',
      transactionRepositoryGetter,
    );
    this.registerInclusionResolver(
      'transaction',
      this.transaction.inclusionResolver,
    );
    this.spv = this.createBelongsToAccessorFor('spv', spvRepositoryGetter);
    this.registerInclusionResolver('spv', this.spv.inclusionResolver);
  }
}
