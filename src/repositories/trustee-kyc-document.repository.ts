import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  Media,
  TrusteeKycDocument,
  TrusteeKycDocumentRelations,
  TrusteeKycDocumentRequirements,
  Users,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';
import {TrusteeKycDocumentRequirementsRepository} from './trustee-kyc-document-requirements.repository';
import {UsersRepository} from './users.repository';

export class TrusteeKycDocumentRepository extends TimeStampRepositoryMixin<
  TrusteeKycDocument,
  typeof TrusteeKycDocument.prototype.id,
  Constructor<
    DefaultCrudRepository<
      TrusteeKycDocument,
      typeof TrusteeKycDocument.prototype.id,
      TrusteeKycDocumentRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly trusteeKycDocumentRequirements: BelongsToAccessor<
    TrusteeKycDocumentRequirements,
    typeof TrusteeKycDocument.prototype.id
  >;

  public readonly media: BelongsToAccessor<
    Media,
    typeof TrusteeKycDocument.prototype.id
  >;

  public readonly users: BelongsToAccessor<
    Users,
    typeof TrusteeKycDocument.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('TrusteeKycDocumentRequirementsRepository')
    protected trusteeKycDocumentRequirementsRepositoryGetter: Getter<TrusteeKycDocumentRequirementsRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(TrusteeKycDocument, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
    this.trusteeKycDocumentRequirements = this.createBelongsToAccessorFor(
      'trusteeKycDocumentRequirements',
      trusteeKycDocumentRequirementsRepositoryGetter,
    );
    this.registerInclusionResolver(
      'trusteeKycDocumentRequirements',
      this.trusteeKycDocumentRequirements.inclusionResolver,
    );
  }
}
