import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {UboDetails, UboDetailsRelations, Media, Users} from '../models';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';

export class UboDetailsRepository extends TimeStampRepositoryMixin<
  UboDetails,
  typeof UboDetails.prototype.id,
  Constructor<
    DefaultCrudRepository<
      UboDetails,
      typeof UboDetails.prototype.id,
      UboDetailsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly panCard: BelongsToAccessor<Media, typeof UboDetails.prototype.id>;

  public readonly users: BelongsToAccessor<Users, typeof UboDetails.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(UboDetails, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.panCard = this.createBelongsToAccessorFor('panCard', mediaRepositoryGetter,);
    this.registerInclusionResolver('panCard', this.panCard.inclusionResolver);
  }
}
