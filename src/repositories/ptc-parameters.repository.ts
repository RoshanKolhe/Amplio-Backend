import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PtcParameters, PtcParametersRelations, SpvApplication} from '../models';
import {SpvApplicationRepository} from './spv-application.repository';

export class PtcParametersRepository extends TimeStampRepositoryMixin<
  PtcParameters,
  typeof PtcParameters.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PtcParameters,
      typeof PtcParameters.prototype.id,
      PtcParametersRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly spvApplication: BelongsToAccessor<SpvApplication, typeof PtcParameters.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('SpvApplicationRepository') protected spvApplicationRepositoryGetter: Getter<SpvApplicationRepository>,
  ) {
    super(PtcParameters, dataSource);
    this.spvApplication = this.createBelongsToAccessorFor('spvApplication', spvApplicationRepositoryGetter,);
    this.registerInclusionResolver('spvApplication', this.spvApplication.inclusionResolver);
  }
}
