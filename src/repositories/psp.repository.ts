import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {Psp, PspRelations, Users, PspMaster, MerchantProfiles, Transaction} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {UsersRepository} from './users.repository';
import {PspMasterRepository} from './psp-master.repository';
import {MerchantProfilesRepository} from './merchant-profiles.repository';
import {TransactionRepository} from './transaction.repository';

export class PspRepository extends TimeStampRepositoryMixin<
  Psp,
  typeof Psp.prototype.id,
  Constructor<DefaultCrudRepository<Psp, typeof Psp.prototype.id, PspRelations>>
>(DefaultCrudRepository) {

  public readonly users: BelongsToAccessor<Users, typeof Psp.prototype.id>;

  public readonly pspMaster: BelongsToAccessor<PspMaster, typeof Psp.prototype.id>;

  public readonly merchantProfiles: BelongsToAccessor<MerchantProfiles, typeof Psp.prototype.id>;

  public readonly transactions: HasManyRepositoryFactory<Transaction, typeof Psp.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>, @repository.getter('PspMasterRepository') protected pspMasterRepositoryGetter: Getter<PspMasterRepository>, @repository.getter('MerchantProfilesRepository') protected merchantProfilesRepositoryGetter: Getter<MerchantProfilesRepository>, @repository.getter('TransactionRepository') protected transactionRepositoryGetter: Getter<TransactionRepository>,) {
    super(Psp, dataSource);
    this.transactions = this.createHasManyRepositoryFactoryFor('transactions', transactionRepositoryGetter,);
    this.registerInclusionResolver('transactions', this.transactions.inclusionResolver);
    this.merchantProfiles = this.createBelongsToAccessorFor('merchantProfiles', merchantProfilesRepositoryGetter,);
    this.registerInclusionResolver('merchantProfiles', this.merchantProfiles.inclusionResolver);
    this.pspMaster = this.createBelongsToAccessorFor('pspMaster', pspMasterRepositoryGetter,);
    this.registerInclusionResolver('pspMaster', this.pspMaster.inclusionResolver);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
  }
}
