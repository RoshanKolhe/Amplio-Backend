import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  PspMaster,
  Spv,
  SpvApplication,
  SpvRelations,
} from '../models';
import {PspMasterRepository} from './psp-master.repository';
import {SpvApplicationRepository} from './spv-application.repository';

export class SpvRepository extends TimeStampRepositoryMixin<
  Spv,
  typeof Spv.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Spv,
      typeof Spv.prototype.id,
      SpvRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spvApplication: BelongsToAccessor<
    SpvApplication,
    typeof Spv.prototype.id
  >;
  public readonly pspMaster: BelongsToAccessor<
    PspMaster,
    typeof Spv.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository')
    protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
    @repository.getter('PspMasterRepository')
    protected pspMasterRepositoryGetter: Getter<PspMasterRepository>,
  ) {
    super(Spv, dataSource);
    this.pspMaster = this.createBelongsToAccessorFor(
      'pspMaster',
      pspMasterRepositoryGetter,
    );
    this.registerInclusionResolver(
      'pspMaster',
      this.pspMaster.inclusionResolver,
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
