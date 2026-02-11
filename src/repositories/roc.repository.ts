import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {Roc, RocRelations, Media} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';

export class RocRepository extends TimeStampRepositoryMixin<
  Roc,
  typeof Roc.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Roc,
      typeof Roc.prototype.id,
      RocRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly chargeFiling: BelongsToAccessor<Media, typeof Roc.prototype.id>;

  public readonly backupSecurity: BelongsToAccessor<Media, typeof Roc.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>,
  ) {
    super(Roc, dataSource);
    this.backupSecurity = this.createBelongsToAccessorFor('backupSecurity', mediaRepositoryGetter,);
    this.registerInclusionResolver('backupSecurity', this.backupSecurity.inclusionResolver);
    this.chargeFiling = this.createBelongsToAccessorFor('chargeFiling', mediaRepositoryGetter,);
    this.registerInclusionResolver('chargeFiling', this.chargeFiling.inclusionResolver);
  }
}
