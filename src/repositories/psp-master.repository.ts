import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {PspMaster, PspMasterRelations, Media, PspMasterFields} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';
import {PspMasterFieldsRepository} from './psp-master-fields.repository';

export class PspMasterRepository extends TimeStampRepositoryMixin<
  PspMaster,
  typeof PspMaster.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PspMaster,
      typeof PspMaster.prototype.id,
      PspMasterRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly logoMedia: BelongsToAccessor<Media, typeof PspMaster.prototype.id>;

  public readonly pspMasterFields: HasManyRepositoryFactory<PspMasterFields, typeof PspMaster.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('PspMasterFieldsRepository') protected pspMasterFieldsRepositoryGetter: Getter<PspMasterFieldsRepository>,) {
    super(PspMaster, dataSource);
    this.pspMasterFields = this.createHasManyRepositoryFactoryFor('pspMasterFields', pspMasterFieldsRepositoryGetter,);
    this.registerInclusionResolver('pspMasterFields', this.pspMasterFields.inclusionResolver);
    this.logoMedia = this.createBelongsToAccessorFor('logoMedia', mediaRepositoryGetter,);
    this.registerInclusionResolver('logoMedia', this.logoMedia.inclusionResolver);
  }
}
