import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, HasManyThroughRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {Documents, DocumentsRelations, Screens, DocumentScreens} from '../models';
import {DocumentScreensRepository} from './document-screens.repository';
import {ScreensRepository} from './screens.repository';

export class DocumentsRepository extends TimeStampRepositoryMixin<
  Documents,
  typeof Documents.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Documents,
      typeof Documents.prototype.id,
      DocumentsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly screens: HasManyThroughRepositoryFactory<Screens, typeof Screens.prototype.id,
          DocumentScreens,
          typeof Documents.prototype.id
        >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('DocumentScreensRepository') protected documentScreensRepositoryGetter: Getter<DocumentScreensRepository>, @repository.getter('ScreensRepository') protected screensRepositoryGetter: Getter<ScreensRepository>,
  ) {
    super(Documents, dataSource);
    this.screens = this.createHasManyThroughRepositoryFactoryFor('screens', screensRepositoryGetter, documentScreensRepositoryGetter,);
    this.registerInclusionResolver('screens', this.screens.inclusionResolver);
  }
}
