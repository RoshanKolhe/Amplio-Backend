import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {ChargeTypes, ChargeTypesRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class ChargeTypesRepository extends TimeStampRepositoryMixin<
  ChargeTypes,
  typeof ChargeTypes.prototype.id,
  Constructor<
    DefaultCrudRepository<
      ChargeTypes,
      typeof ChargeTypes.prototype.id,
      ChargeTypesRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(ChargeTypes, dataSource);
  }
}
