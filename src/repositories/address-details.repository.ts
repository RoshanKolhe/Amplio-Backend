import {Constructor, Getter, inject} from '@loopback/core';
import {BelongsToAccessor, DefaultCrudRepository, repository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {AddressDetails, AddressDetailsRelations, Users, Media} from '../models';
import {UsersRepository} from './users.repository';
import {MediaRepository} from './media.repository';

export class AddressDetailsRepository extends TimeStampRepositoryMixin<
  AddressDetails,
  typeof AddressDetails.prototype.id,
  Constructor<
    DefaultCrudRepository<
      AddressDetails,
      typeof AddressDetails.prototype.id,
      AddressDetailsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly users: BelongsToAccessor<Users, typeof AddressDetails.prototype.id>;

  public readonly addressProof: BelongsToAccessor<Media, typeof AddressDetails.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(AddressDetails, dataSource);
    this.addressProof = this.createBelongsToAccessorFor('addressProof', mediaRepositoryGetter,);
    this.registerInclusionResolver('addressProof', this.addressProof.inclusionResolver);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
  }
}
