import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {EscrowSetup, EscrowSetupRelations, SpvApplication} from '../models';
import {SpvApplicationRepository} from './spv-application.repository';

export class EscrowSetupRepository extends TimeStampRepositoryMixin<
  EscrowSetup,
  typeof EscrowSetup.prototype.id,
  Constructor<
    DefaultCrudRepository<
      EscrowSetup,
      typeof EscrowSetup.prototype.id,
      EscrowSetupRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly spvApplication: BelongsToAccessor<SpvApplication, typeof EscrowSetup.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('SpvApplicationRepository') protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
  ) {
    super(EscrowSetup, dataSource);
    this.spvApplication = this.createBelongsToAccessorFor('spvApplication', spvApplicationRepositoryGetter,);
    this.registerInclusionResolver('spvApplication', this.spvApplication.inclusionResolver);
  }
}
