import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {PspMasterFields, PspMasterFieldsRelations, PspMaster} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PspMasterRepository} from './psp-master.repository';

export class PspMasterFieldsRepository extends TimeStampRepositoryMixin<
  PspMasterFields,
  typeof PspMasterFields.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PspMasterFields,
      typeof PspMasterFields.prototype.id,
      PspMasterFieldsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly pspMaster: BelongsToAccessor<PspMaster, typeof PspMasterFields.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('PspMasterRepository') protected pspMasterRepositoryGetter: Getter<PspMasterRepository>,) {
    super(PspMasterFields, dataSource);
    this.pspMaster = this.createBelongsToAccessorFor('pspMaster', pspMasterRepositoryGetter,);
    this.registerInclusionResolver('pspMaster', this.pspMaster.inclusionResolver);
  }
}
