import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {CollateralTypes, CollateralTypesRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class CollateralTypesRepository extends TimeStampRepositoryMixin<
  CollateralTypes,
  typeof CollateralTypes.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CollateralTypes,
      typeof CollateralTypes.prototype.id,
      CollateralTypesRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(CollateralTypes, dataSource);
  }
}
