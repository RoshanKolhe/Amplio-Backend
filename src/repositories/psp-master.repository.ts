import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor, HasManyRepositoryFactory} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {PspMaster, PspMasterRelations, Media, PspMasterFields, Psp, BankDetails} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MediaRepository} from './media.repository';
import {PspMasterFieldsRepository} from './psp-master-fields.repository';
import {PspRepository} from './psp.repository';
import {BankDetailsRepository} from './bank-details.repository';

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

  public readonly psps: HasManyRepositoryFactory<Psp, typeof PspMaster.prototype.id>;

  public readonly bankDetails: HasManyRepositoryFactory<BankDetails, typeof PspMaster.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('PspMasterFieldsRepository') protected pspMasterFieldsRepositoryGetter: Getter<PspMasterFieldsRepository>, @repository.getter('PspRepository') protected pspRepositoryGetter: Getter<PspRepository>, @repository.getter('BankDetailsRepository') protected bankDetailsRepositoryGetter: Getter<BankDetailsRepository>,) {
    super(PspMaster, dataSource);
    this.bankDetails = this.createHasManyRepositoryFactoryFor('bankDetails', bankDetailsRepositoryGetter,);
    this.registerInclusionResolver('bankDetails', this.bankDetails.inclusionResolver);
    this.psps = this.createHasManyRepositoryFactoryFor('psps', pspRepositoryGetter,);
    this.registerInclusionResolver('psps', this.psps.inclusionResolver);
    this.pspMasterFields = this.createHasManyRepositoryFactoryFor('pspMasterFields', pspMasterFieldsRepositoryGetter,);
    this.registerInclusionResolver('pspMasterFields', this.pspMasterFields.inclusionResolver);
    this.logoMedia = this.createBelongsToAccessorFor('logoMedia', mediaRepositoryGetter,);
    this.registerInclusionResolver('logoMedia', this.logoMedia.inclusionResolver);
  }
}
