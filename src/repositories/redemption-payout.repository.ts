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
  RedemptionPayout,
  RedemptionPayoutRelations,
  Spv,
} from '../models';
import {InvestorProfileRepository} from './investor-profile.repository';
import {SpvRepository} from './spv.repository';

export class RedemptionPayoutRepository extends TimeStampRepositoryMixin<
  RedemptionPayout,
  typeof RedemptionPayout.prototype.id,
  Constructor<
    DefaultCrudRepository<
      RedemptionPayout,
      typeof RedemptionPayout.prototype.id,
      RedemptionPayoutRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof RedemptionPayout.prototype.id
  >;

  public readonly spv: BelongsToAccessor<
    Spv,
    typeof RedemptionPayout.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
  ) {
    super(RedemptionPayout, dataSource);
    this.investorProfile = this.createBelongsToAccessorFor(
      'investorProfile',
      investorProfileRepositoryGetter,
    );
    this.registerInclusionResolver(
      'investorProfile',
      this.investorProfile.inclusionResolver,
    );
    this.spv = this.createBelongsToAccessorFor('spv', spvRepositoryGetter);
    this.registerInclusionResolver('spv', this.spv.inclusionResolver);
  }
}
