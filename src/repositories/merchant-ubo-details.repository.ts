import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MerchantUboDetails, MerchantUboDetailsRelations, Media, Users} from '../models';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';

export class MerchantUboDetailsRepository extends TimeStampRepositoryMixin<
  MerchantUboDetails,
  typeof MerchantUboDetails.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantUboDetails,
      typeof MerchantUboDetails.prototype.id,
      MerchantUboDetailsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly panCard: BelongsToAccessor<Media, typeof MerchantUboDetails.prototype.id>;

  public readonly users: BelongsToAccessor<Users, typeof MerchantUboDetails.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(MerchantUboDetails, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.panCard = this.createBelongsToAccessorFor('panCard', mediaRepositoryGetter,);
    this.registerInclusionResolver('panCard', this.panCard.inclusionResolver);
  }
}
