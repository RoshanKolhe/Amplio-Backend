import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  BusinessKycDocumentType,
  Media,
  PlatformAgreement,
  PlatformAgreementRelations,
  Users,
} from '../models';
import {BusinessKycDocumentTypeRepository} from './business-kyc-document-type.repository';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';


export class PlatformAgreementRepository extends TimeStampRepositoryMixin<
  PlatformAgreement,
  typeof PlatformAgreement.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PlatformAgreement,
      typeof PlatformAgreement.prototype.id,
      PlatformAgreementRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly users: BelongsToAccessor<
    Users,
    typeof PlatformAgreement.prototype.id
  >;

  public readonly businessKycDocumentType: BelongsToAccessor<
    BusinessKycDocumentType,
    typeof PlatformAgreement.prototype.id
  >;

  public readonly media: BelongsToAccessor<
    Media,
    typeof PlatformAgreement.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
    @repository.getter('BusinessKycDocumentTypeRepository')
    protected businessKycDocumentTypeRepositoryGetter: Getter<BusinessKycDocumentTypeRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(PlatformAgreement, dataSource);
    this.users = this.createBelongsToAccessorFor(
      'users',
      usersRepositoryGetter,
    );
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.businessKycDocumentType = this.createBelongsToAccessorFor(
      'businessKycDocumentType',
      businessKycDocumentTypeRepositoryGetter,
    );
    this.registerInclusionResolver(
      'businessKycDocumentType',
      this.businessKycDocumentType.inclusionResolver,
    );
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
  }
}
