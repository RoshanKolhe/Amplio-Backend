import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, HasManyThroughRepositoryFactory, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {Users, UsersRelations, Roles, UserRoles, KycApplications, BankDetails, AuthorizeSignatories} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {UserRolesRepository} from './user-roles.repository';
import {RolesRepository} from './roles.repository';
import {KycApplicationsRepository} from './kyc-applications.repository';
import {BankDetailsRepository} from './bank-details.repository';
import {AuthorizeSignatoriesRepository} from './authorize-signatories.repository';

export class UsersRepository extends TimeStampRepositoryMixin<
  Users,
  typeof Users.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Users,
      typeof Users.prototype.id,
      UsersRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly roles: HasManyThroughRepositoryFactory<Roles, typeof Roles.prototype.id,
          UserRoles,
          typeof Users.prototype.id
        >;

  public readonly kycApplications: HasManyRepositoryFactory<KycApplications, typeof Users.prototype.id>;

  public readonly bankDetails: HasManyRepositoryFactory<BankDetails, typeof Users.prototype.id>;

  public readonly authorizeSignatories: HasManyRepositoryFactory<AuthorizeSignatories, typeof Users.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('UserRolesRepository') protected userRolesRepositoryGetter: Getter<UserRolesRepository>, @repository.getter('RolesRepository') protected rolesRepositoryGetter: Getter<RolesRepository>, @repository.getter('KycApplicationsRepository') protected kycApplicationsRepositoryGetter: Getter<KycApplicationsRepository>, @repository.getter('BankDetailsRepository') protected bankDetailsRepositoryGetter: Getter<BankDetailsRepository>, @repository.getter('AuthorizeSignatoriesRepository') protected authorizeSignatoriesRepositoryGetter: Getter<AuthorizeSignatoriesRepository>,
  ) {
    super(Users, dataSource);
    this.authorizeSignatories = this.createHasManyRepositoryFactoryFor('authorizeSignatories', authorizeSignatoriesRepositoryGetter,);
    this.registerInclusionResolver('authorizeSignatories', this.authorizeSignatories.inclusionResolver);
    this.bankDetails = this.createHasManyRepositoryFactoryFor('bankDetails', bankDetailsRepositoryGetter,);
    this.registerInclusionResolver('bankDetails', this.bankDetails.inclusionResolver);
    this.kycApplications = this.createHasManyRepositoryFactoryFor('kycApplications', kycApplicationsRepositoryGetter,);
    this.registerInclusionResolver('kycApplications', this.kycApplications.inclusionResolver);
    this.roles = this.createHasManyThroughRepositoryFactoryFor('roles', rolesRepositoryGetter, userRolesRepositoryGetter,);
    this.registerInclusionResolver('roles', this.roles.inclusionResolver);
  }
}
