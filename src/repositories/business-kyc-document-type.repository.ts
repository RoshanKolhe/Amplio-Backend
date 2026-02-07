import {inject, Getter, Constructor} from '@loopback/core';
import {
  DefaultCrudRepository,
  repository,
  BelongsToAccessor,
  HasManyRepositoryFactory,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  BusinessKycDocumentType,
  BusinessKycDocumentTypeRelations,
  Media,
  Roles,
} from '../models';
import {MediaRepository} from './media.repository';
import {RolesRepository} from './roles.repository';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class BusinessKycDocumentTypeRepository extends TimeStampRepositoryMixin<
  BusinessKycDocumentType,
  typeof BusinessKycDocumentType.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycDocumentType,
      typeof BusinessKycDocumentType.prototype.id,
      BusinessKycDocumentTypeRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly fileTemplate: BelongsToAccessor<
    Media,
    typeof BusinessKycDocumentType.prototype.id
  >;

  public readonly roles: HasManyRepositoryFactory<
    Roles,
    typeof BusinessKycDocumentType.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
    @repository.getter('RolesRepository')
    protected rolesRepositoryGetter: Getter<RolesRepository>,
  ) {
    super(BusinessKycDocumentType, dataSource);
    this.roles = this.createHasManyRepositoryFactoryFor(
      'roles',
      rolesRepositoryGetter,
    );
    this.registerInclusionResolver('roles', this.roles.inclusionResolver);
    this.fileTemplate = this.createBelongsToAccessorFor(
      'fileTemplate',
      mediaRepositoryGetter,
    );
    this.registerInclusionResolver(
      'fileTemplate',
      this.fileTemplate.inclusionResolver,
    );
  }
}
