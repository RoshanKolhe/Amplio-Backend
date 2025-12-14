import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BankDetails, BankDetailsRelations, Users, Media} from '../models';
import {UsersRepository} from './users.repository';
import {MediaRepository} from './media.repository';

export class BankDetailsRepository extends TimeStampRepositoryMixin<
  BankDetails,
  typeof BankDetails.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BankDetails,
      typeof BankDetails.prototype.id,
      BankDetailsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly users: BelongsToAccessor<Users, typeof BankDetails.prototype.id>;

  public readonly bankAccountProof: BelongsToAccessor<Media, typeof BankDetails.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(BankDetails, dataSource);
    this.bankAccountProof = this.createBelongsToAccessorFor('bankAccountProof', mediaRepositoryGetter,);
    this.registerInclusionResolver('bankAccountProof', this.bankAccountProof.inclusionResolver);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
  }
}
