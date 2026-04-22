import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  EscrowTransaction,
  EscrowTransactionRelations,
  Spv,
  Transaction,
} from '../models';
import {SpvRepository} from './spv.repository';
import {TransactionRepository} from './transaction.repository';

export class EscrowTransactionRepository extends TimeStampRepositoryMixin<
  EscrowTransaction,
  typeof EscrowTransaction.prototype.id,
  Constructor<
    DefaultCrudRepository<
      EscrowTransaction,
      typeof EscrowTransaction.prototype.id,
      EscrowTransactionRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly transaction: BelongsToAccessor<
    Transaction,
    typeof EscrowTransaction.prototype.id
  >;

  public readonly spv: BelongsToAccessor<
    Spv,
    typeof EscrowTransaction.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('TransactionRepository')
    protected transactionRepositoryGetter: Getter<TransactionRepository>,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
  ) {
    super(EscrowTransaction, dataSource);
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
