import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {AuthorizeSignatories, AuthorizeSignatoriesRelations, Media, Users} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';

export class AuthorizeSignatoriesRepository extends TimeStampRepositoryMixin<
  AuthorizeSignatories,
  typeof AuthorizeSignatories.prototype.id,
  Constructor<
    DefaultCrudRepository<
      AuthorizeSignatories,
      typeof AuthorizeSignatories.prototype.id,
      AuthorizeSignatoriesRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly panCardFile: BelongsToAccessor<Media, typeof AuthorizeSignatories.prototype.id>;

  public readonly boardResolutionFile: BelongsToAccessor<Media, typeof AuthorizeSignatories.prototype.id>;

  public readonly users: BelongsToAccessor<Users, typeof AuthorizeSignatories.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(AuthorizeSignatories, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.boardResolutionFile = this.createBelongsToAccessorFor('boardResolutionFile', mediaRepositoryGetter,);
    this.registerInclusionResolver('boardResolutionFile', this.boardResolutionFile.inclusionResolver);
    this.panCardFile = this.createBelongsToAccessorFor('panCardFile', mediaRepositoryGetter,);
    this.registerInclusionResolver('panCardFile', this.panCardFile.inclusionResolver);
  }
}
