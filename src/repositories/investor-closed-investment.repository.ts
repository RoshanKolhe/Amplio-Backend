import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  InvestorClosedInvestment,
  InvestorClosedInvestmentRelations,
  InvestorProfile,
  PoolFinancials,
  Spv,
  Users,
} from '../models';
import {InvestorProfileRepository} from './investor-profile.repository';
import {PoolFinancialsRepository} from './pool-financials.repository';
import {SpvRepository} from './spv.repository';
import {UsersRepository} from './users.repository';

export class InvestorClosedInvestmentRepository extends TimeStampRepositoryMixin<
  InvestorClosedInvestment,
  typeof InvestorClosedInvestment.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorClosedInvestment,
      typeof InvestorClosedInvestment.prototype.id,
      InvestorClosedInvestmentRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof InvestorClosedInvestment.prototype.id
  >;

  public readonly users: BelongsToAccessor<
    Users,
    typeof InvestorClosedInvestment.prototype.id
  >;

  public readonly spv: BelongsToAccessor<
    Spv,
    typeof InvestorClosedInvestment.prototype.id
  >;

  public readonly poolFinancials: BelongsToAccessor<
    PoolFinancials,
    typeof InvestorClosedInvestment.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
    @repository.getter('PoolFinancialsRepository')
    protected poolFinancialsRepositoryGetter: Getter<PoolFinancialsRepository>,
  ) {
    super(InvestorClosedInvestment, dataSource);
    this.investorProfile = this.createBelongsToAccessorFor(
      'investorProfile',
      investorProfileRepositoryGetter,
    );
    this.registerInclusionResolver(
      'investorProfile',
      this.investorProfile.inclusionResolver,
    );
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
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
