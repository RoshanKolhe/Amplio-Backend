import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  InvestorProfile,
  WithdrawalRequest,
  WithdrawalRequestRelations,
} from '../models';
import {InvestorProfileRepository} from './investor-profile.repository';

export class WithdrawalRequestRepository extends TimeStampRepositoryMixin<
  WithdrawalRequest,
  typeof WithdrawalRequest.prototype.id,
  Constructor<
    DefaultCrudRepository<
      WithdrawalRequest,
      typeof WithdrawalRequest.prototype.id,
      WithdrawalRequestRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof WithdrawalRequest.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
  ) {
    super(WithdrawalRequest, dataSource);
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
