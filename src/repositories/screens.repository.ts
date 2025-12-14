import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, HasManyThroughRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {Screens, ScreensRelations, Documents, DocumentScreens} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {DocumentScreensRepository} from './document-screens.repository';
import {DocumentsRepository} from './documents.repository';

export class ScreensRepository extends TimeStampRepositoryMixin<
  Screens,
  typeof Screens.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Screens,
      typeof Screens.prototype.id,
      ScreensRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly documents: HasManyThroughRepositoryFactory<Documents, typeof Documents.prototype.id,
          DocumentScreens,
          typeof Screens.prototype.id
        >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('DocumentScreensRepository') protected documentScreensRepositoryGetter: Getter<DocumentScreensRepository>, @repository.getter('DocumentsRepository') protected documentsRepositoryGetter: Getter<DocumentsRepository>,
  ) {
    super(Screens, dataSource);
    this.documents = this.createHasManyThroughRepositoryFactoryFor('documents', documentsRepositoryGetter, documentScreensRepositoryGetter,);
    this.registerInclusionResolver('documents', this.documents.inclusionResolver);
  }
}
