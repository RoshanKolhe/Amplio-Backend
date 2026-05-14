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
  Spv,
  SpvPaymentVerification,
  SpvPaymentVerificationRelations,
} from '../models';
import {InvestorProfileRepository} from './investor-profile.repository';
import {SpvRepository} from './spv.repository';

export class SpvPaymentVerificationRepository extends TimeStampRepositoryMixin<
  SpvPaymentVerification,
  typeof SpvPaymentVerification.prototype.id,
  Constructor<
    DefaultCrudRepository<
      SpvPaymentVerification,
      typeof SpvPaymentVerification.prototype.id,
      SpvPaymentVerificationRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof SpvPaymentVerification.prototype.id
  >;

  public readonly spv: BelongsToAccessor<
    Spv,
    typeof SpvPaymentVerification.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
    @repository.getter('SpvRepository')
    protected spvRepositoryGetter: Getter<SpvRepository>,
  ) {
    super(SpvPaymentVerification, dataSource);
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
