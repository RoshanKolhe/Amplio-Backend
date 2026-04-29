import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  InvestorEscrowAccount,
  InvestorEscrowLedger,
  InvestorEscrowLedgerRelations,
  InvestorProfile,
} from '../models';
import {InvestorEscrowAccountRepository} from './investor-escrow-account.repository';
import {InvestorProfileRepository} from './investor-profile.repository';

export class InvestorEscrowLedgerRepository extends TimeStampRepositoryMixin<
  InvestorEscrowLedger,
  typeof InvestorEscrowLedger.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorEscrowLedger,
      typeof InvestorEscrowLedger.prototype.id,
      InvestorEscrowLedgerRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorEscrowAccount: BelongsToAccessor<
    InvestorEscrowAccount,
    typeof InvestorEscrowLedger.prototype.id
  >;

  public readonly investor: BelongsToAccessor<
    InvestorProfile,
    typeof InvestorEscrowLedger.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorEscrowAccountRepository')
    protected investorEscrowAccountRepositoryGetter: Getter<InvestorEscrowAccountRepository>,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
  ) {
    super(InvestorEscrowLedger, dataSource);
    this.investor = this.createBelongsToAccessorFor(
      'investor',
      investorProfileRepositoryGetter,
    );
    this.registerInclusionResolver('investor', this.investor.inclusionResolver);
    this.investorEscrowAccount = this.createBelongsToAccessorFor(
      'investorEscrowAccount',
      investorEscrowAccountRepositoryGetter,
    );
    this.registerInclusionResolver(
      'investorEscrowAccount',
      this.investorEscrowAccount.inclusionResolver,
    );
  }
}
