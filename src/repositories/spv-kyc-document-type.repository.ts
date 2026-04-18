import {inject, Getter, Constructor} from '@loopback/core';
import {
  DefaultCrudRepository,
  repository,
  BelongsToAccessor,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  Media,
  SpvKycDocumentType,
  SpvKycDocumentTypeRelations,
} from '../models';
import {MediaRepository} from './media.repository';

export class SpvKycDocumentTypeRepository extends TimeStampRepositoryMixin<
  SpvKycDocumentType,
  typeof SpvKycDocumentType.prototype.id,
  Constructor<
    DefaultCrudRepository<
      SpvKycDocumentType,
      typeof SpvKycDocumentType.prototype.id,
      SpvKycDocumentTypeRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly fileTemplate: BelongsToAccessor<
    Media,
    typeof SpvKycDocumentType.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(SpvKycDocumentType, dataSource);
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
