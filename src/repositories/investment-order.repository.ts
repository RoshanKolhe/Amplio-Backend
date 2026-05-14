import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  InvestmentOrder,
  InvestmentOrderRelations,
  InvestorProfile,
} from '../models';
import {InvestorProfileRepository} from './investor-profile.repository';

export class InvestmentOrderRepository extends TimeStampRepositoryMixin<
  InvestmentOrder,
  typeof InvestmentOrder.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestmentOrder,
      typeof InvestmentOrder.prototype.id,
      InvestmentOrderRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof InvestmentOrder.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
  ) {
    super(InvestmentOrder, dataSource);
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
