import {Constructor, Getter, inject} from '@loopback/core';
import {
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  SpvApplication,
  SpvApplicationStatusMaster,
  SpvApplicationStatusMasterRelations,
} from '../models';
import {SpvApplicationRepository} from './spv-application.repository';

export class SpvApplicationStatusMasterRepository extends TimeStampRepositoryMixin<
  SpvApplicationStatusMaster,
  typeof SpvApplicationStatusMaster.prototype.id,
  Constructor<
    DefaultCrudRepository<
      SpvApplicationStatusMaster,
      typeof SpvApplicationStatusMaster.prototype.id,
      SpvApplicationStatusMasterRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly spvApplications: HasManyRepositoryFactory<
    SpvApplication,
    typeof SpvApplicationStatusMaster.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('SpvApplicationRepository')
    protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
  ) {
    super(SpvApplicationStatusMaster, dataSource);
    this.spvApplications = this.createHasManyRepositoryFactoryFor(
      'spvApplications',
      spvApplicationRepositoryGetter,
    );
    this.registerInclusionResolver(
      'spvApplications',
      this.spvApplications.inclusionResolver,
    );
  }
}
