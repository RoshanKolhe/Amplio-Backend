import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {Transaction, TransactionRelations, Psp} from '../models';
import {PspRepository} from './psp.repository';

export class TransactionRepository extends TimeStampRepositoryMixin<
  Transaction,
  typeof Transaction.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Transaction,
      typeof Transaction.prototype.id,
      TransactionRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly psp: BelongsToAccessor<Psp, typeof Transaction.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('PspRepository') protected pspRepositoryGetter: Getter<PspRepository>,
  ) {
    super(Transaction, dataSource);
    this.psp = this.createBelongsToAccessorFor('psp', pspRepositoryGetter,);
    this.registerInclusionResolver('psp', this.psp.inclusionResolver);
  }
}
