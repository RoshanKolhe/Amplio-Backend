import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {KycApplications, KycApplicationsRelations, Users} from '../models';
import {UsersRepository} from './users.repository';

export class KycApplicationsRepository extends TimeStampRepositoryMixin<
  KycApplications,
  typeof KycApplications.prototype.id,
  Constructor<
    DefaultCrudRepository<
      KycApplications,
      typeof KycApplications.prototype.id,
      KycApplicationsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly users: BelongsToAccessor<Users, typeof KycApplications.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(KycApplications, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
  }
}
