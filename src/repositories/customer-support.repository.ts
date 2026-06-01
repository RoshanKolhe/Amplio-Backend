import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  CustomerSupport,
  CustomerSupportRelations,
  InvestmentOrder,
  InvestorProfile,
  Media,
  Users,
} from '../models';
import {InvestmentOrderRepository} from './investment-order.repository';
import {InvestorProfileRepository} from './investor-profile.repository';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';

export class CustomerSupportRepository extends TimeStampRepositoryMixin<
  CustomerSupport,
  typeof CustomerSupport.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CustomerSupport,
      typeof CustomerSupport.prototype.id,
      CustomerSupportRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly order: BelongsToAccessor<
    InvestmentOrder,
    typeof CustomerSupport.prototype.id
  >;

  public readonly investorProfile: BelongsToAccessor<
    InvestorProfile,
    typeof CustomerSupport.prototype.id
  >;

  public readonly attachmentMedia: BelongsToAccessor<
    Media,
    typeof CustomerSupport.prototype.id
  >;

  public readonly superAdmin: BelongsToAccessor<
    Users,
    typeof CustomerSupport.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestmentOrderRepository')
    protected investmentOrderRepositoryGetter: Getter<InvestmentOrderRepository>,
    @repository.getter('InvestorProfileRepository')
    protected investorProfileRepositoryGetter: Getter<InvestorProfileRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(CustomerSupport, dataSource);
    this.order = this.createBelongsToAccessorFor(
      'order',
      investmentOrderRepositoryGetter,
    );
    this.registerInclusionResolver('order', this.order.inclusionResolver);

    this.investorProfile = this.createBelongsToAccessorFor(
      'investorProfile',
      investorProfileRepositoryGetter,
    );
    this.registerInclusionResolver(
      'investorProfile',
      this.investorProfile.inclusionResolver,
    );

    this.attachmentMedia = this.createBelongsToAccessorFor(
      'attachmentMedia',
      mediaRepositoryGetter,
    );
    this.registerInclusionResolver(
      'attachmentMedia',
      this.attachmentMedia.inclusionResolver,
    );

    this.superAdmin = this.createBelongsToAccessorFor(
      'superAdmin',
      usersRepositoryGetter,
    );
    this.registerInclusionResolver(
      'superAdmin',
      this.superAdmin.inclusionResolver,
    );
  }
}
