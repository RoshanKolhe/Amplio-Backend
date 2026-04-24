import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  InvestorProfile,
  InvestorPtcHolding,
  InvestorPtcHoldingRelations,
  PoolFinancials,
  PtcIssuance,
  Spv,
  Users,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {InvestorProfileRepository} from './investor-profile.repository';
import {PoolFinancialsRepository} from './pool-financials.repository';
import {PtcIssuanceRepository} from './ptc-issuance.repository';
import {SpvRepository} from './spv.repository';
import {UsersRepository} from './users.repository';

export class InvestorPtcHoldingRepository extends TimeStampRepositoryMixin<
  InvestorPtcHolding,
  typeof InvestorPtcHolding.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorPtcHolding,
      typeof InvestorPtcHolding.prototype.id,
      InvestorPtcHoldingRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly ptcIssuance: BelongsToAccessor<
    PtcIssuance,
    typeof InvestorPtcHolding.prototype.id
  >;

  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof InvestorPtcHolding.prototype.id
  >;

  public readonly users: BelongsToAccessor<Users, typeof InvestorPtcHolding.prototype.id>;
  public readonly spv: BelongsToAccessor<Spv, typeof InvestorPtcHolding.prototype.id>;
  public readonly poolFinancials: BelongsToAccessor<
    PoolFinancials,
    typeof InvestorPtcHolding.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('PtcIssuanceRepository')
    protected ptcIssuanceRepositoryGetter: Getter<PtcIssuanceRepository>,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
    @repository.getter('PoolFinancialsRepository')
    protected poolFinancialsRepositoryGetter: Getter<PoolFinancialsRepository>,
  ) {
    super(InvestorPtcHolding, dataSource);
    this.ptcIssuance = this.createBelongsToAccessorFor(
      'ptcIssuance',
      ptcIssuanceRepositoryGetter,
    );
    this.registerInclusionResolver('ptcIssuance', this.ptcIssuance.inclusionResolver);
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
