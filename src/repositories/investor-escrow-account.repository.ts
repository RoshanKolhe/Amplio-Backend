import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  BankDetails,
  InvestorEscrowAccount,
  InvestorEscrowAccountRelations,
  InvestorEscrowLedger,
  InvestorProfile,
  Users,
} from '../models';
import {BankDetailsRepository} from './bank-details.repository';
import {InvestorEscrowLedgerRepository} from './investor-escrow-ledger.repository';
import {InvestorProfileRepository} from './investor-profile.repository';
import {UsersRepository} from './users.repository';

export class InvestorEscrowAccountRepository extends TimeStampRepositoryMixin<
  InvestorEscrowAccount,
  typeof InvestorEscrowAccount.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorEscrowAccount,
      typeof InvestorEscrowAccount.prototype.id,
      InvestorEscrowAccountRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof InvestorEscrowAccount.prototype.id
  >;

  public readonly users: BelongsToAccessor<
    Users,
    typeof InvestorEscrowAccount.prototype.id
  >;

  public readonly bankDetails: BelongsToAccessor<
    BankDetails,
    typeof InvestorEscrowAccount.prototype.id
  >;

  public readonly investorEscrowLedgers: HasManyRepositoryFactory<
    InvestorEscrowLedger,
    typeof InvestorEscrowAccount.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
    @repository.getter('BankDetailsRepository')
    protected bankDetailsRepositoryGetter: Getter<BankDetailsRepository>,
    @repository.getter('InvestorEscrowLedgerRepository')
    protected investorEscrowLedgerRepositoryGetter: Getter<InvestorEscrowLedgerRepository>,
  ) {
    super(InvestorEscrowAccount, dataSource);
    this.investorEscrowLedgers = this.createHasManyRepositoryFactoryFor(
      'investorEscrowLedgers',
      investorEscrowLedgerRepositoryGetter,
    );
    this.registerInclusionResolver(
      'investorEscrowLedgers',
      this.investorEscrowLedgers.inclusionResolver,
    );
    this.bankDetails = this.createBelongsToAccessorFor(
      'bankDetails',
      bankDetailsRepositoryGetter,
    );
    this.registerInclusionResolver(
      'bankDetails',
      this.bankDetails.inclusionResolver,
    );
    this.users = this.createBelongsToAccessorFor(
      'users',
      usersRepositoryGetter,
    );
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.investorProfile = this.createBelongsToAccessorFor(
      'investorProfile',
      investorProfileRepositoryGetter,
    );
    this.registerInclusionResolver(
      'investorProfile',
      this.investorProfile.inclusionResolver,
    );
  }
}
