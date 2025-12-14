import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {UserUploadedDocuments, UserUploadedDocumentsRelations, Users, Documents, Media} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {UsersRepository} from './users.repository';
import {DocumentsRepository} from './documents.repository';
import {MediaRepository} from './media.repository';

export class UserUploadedDocumentsRepository extends TimeStampRepositoryMixin<
  UserUploadedDocuments,
  typeof UserUploadedDocuments.prototype.id,
  Constructor<
    DefaultCrudRepository<
      UserUploadedDocuments,
      typeof UserUploadedDocuments.prototype.id,
      UserUploadedDocumentsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly users: BelongsToAccessor<Users, typeof UserUploadedDocuments.prototype.id>;

  public readonly documents: BelongsToAccessor<Documents, typeof UserUploadedDocuments.prototype.id>;

  public readonly documentsFile: BelongsToAccessor<Media, typeof UserUploadedDocuments.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>, @repository.getter('DocumentsRepository') protected documentsRepositoryGetter: Getter<DocumentsRepository>, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(UserUploadedDocuments, dataSource);
    this.documentsFile = this.createBelongsToAccessorFor('documentsFile', mediaRepositoryGetter,);
    this.registerInclusionResolver('documentsFile', this.documentsFile.inclusionResolver);
    this.documents = this.createBelongsToAccessorFor('documents', documentsRepositoryGetter,);
    this.registerInclusionResolver('documents', this.documents.inclusionResolver);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
  }
}
