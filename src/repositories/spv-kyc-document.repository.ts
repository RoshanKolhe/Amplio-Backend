import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  Media,
  SpvApplication,
  SpvKycDocument,
  SpvKycDocumentRelations,
  SpvKycDocumentType,
} from '../models';
import {MediaRepository} from './media.repository';
import {SpvApplicationRepository} from './spv-application.repository';
import {SpvKycDocumentTypeRepository} from './spv-kyc-document-type.repository';

export class SpvKycDocumentRepository extends TimeStampRepositoryMixin<
  SpvKycDocument,
  typeof SpvKycDocument.prototype.id,
  Constructor<
    DefaultCrudRepository<
      SpvKycDocument,
      typeof SpvKycDocument.prototype.id,
      SpvKycDocumentRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spvApplication: BelongsToAccessor<
    SpvApplication,
    typeof SpvKycDocument.prototype.id
  >;

  public readonly spvKycDocumentType: BelongsToAccessor<
    SpvKycDocumentType,
    typeof SpvKycDocument.prototype.id
  >;

  public readonly media: BelongsToAccessor<
    Media,
    typeof SpvKycDocument.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository')
    protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
    @repository.getter('SpvKycDocumentTypeRepository')
    protected spvKycDocumentTypeRepositoryGetter: Getter<SpvKycDocumentTypeRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(SpvKycDocument, dataSource);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
    this.spvKycDocumentType = this.createBelongsToAccessorFor(
      'spvKycDocumentType',
      spvKycDocumentTypeRepositoryGetter,
    );
    this.registerInclusionResolver(
      'spvKycDocumentType',
      this.spvKycDocumentType.inclusionResolver,
    );
    this.spvApplication = this.createBelongsToAccessorFor(
      'spvApplication',
      spvApplicationRepositoryGetter,
    );
    this.registerInclusionResolver(
      'spvApplication',
      this.spvApplication.inclusionResolver,
    );
  }
}
