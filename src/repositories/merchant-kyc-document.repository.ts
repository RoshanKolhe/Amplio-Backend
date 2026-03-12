import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  Media,
  MerchantKycDocument,
  MerchantKycDocumentRelations,
  MerchantKycDocumentRequirements,
  Users,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';
import {MerchantKycDocumentRequirementsRepository} from './merchant-kyc-document-requirements.repository';
import {UsersRepository} from './users.repository';

export class MerchantKycDocumentRepository extends TimeStampRepositoryMixin<
  MerchantKycDocument,
  typeof MerchantKycDocument.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantKycDocument,
      typeof MerchantKycDocument.prototype.id,
      MerchantKycDocumentRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly merchantKycDocumentRequirements: BelongsToAccessor<
    MerchantKycDocumentRequirements,
    typeof MerchantKycDocument.prototype.id
  >;

  public readonly media: BelongsToAccessor<
    Media,
    typeof MerchantKycDocument.prototype.id
  >;

  public readonly users: BelongsToAccessor<
    Users,
    typeof MerchantKycDocument.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('MerchantKycDocumentRequirementsRepository')
    protected merchantKycDocumentRequirementsRepositoryGetter: Getter<MerchantKycDocumentRequirementsRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(MerchantKycDocument, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
    this.merchantKycDocumentRequirements = this.createBelongsToAccessorFor(
      'merchantKycDocumentRequirements',
      merchantKycDocumentRequirementsRepositoryGetter,
    );
    this.registerInclusionResolver(
      'merchantKycDocumentRequirements',
      this.merchantKycDocumentRequirements.inclusionResolver,
    );
  }
}
