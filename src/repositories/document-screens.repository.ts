import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {DocumentScreens, DocumentScreensRelations, Documents, Screens} from '../models';
import {DocumentsRepository} from './documents.repository';
import {ScreensRepository} from './screens.repository';

export class DocumentScreensRepository extends TimeStampRepositoryMixin<
  DocumentScreens,
  typeof DocumentScreens.prototype.id,
  Constructor<
    DefaultCrudRepository<
      DocumentScreens,
      typeof DocumentScreens.prototype.id,
      DocumentScreensRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly documents: BelongsToAccessor<Documents, typeof DocumentScreens.prototype.id>;

  public readonly screens: BelongsToAccessor<Screens, typeof DocumentScreens.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('DocumentsRepository') protected documentsRepositoryGetter: Getter<DocumentsRepository>, @repository.getter('ScreensRepository') protected screensRepositoryGetter: Getter<ScreensRepository>,
  ) {
    super(DocumentScreens, dataSource);
    this.screens = this.createBelongsToAccessorFor('screens', screensRepositoryGetter,);
    this.registerInclusionResolver('screens', this.screens.inclusionResolver);
    this.documents = this.createBelongsToAccessorFor('documents', documentsRepositoryGetter,);
    this.registerInclusionResolver('documents', this.documents.inclusionResolver);
  }
}
