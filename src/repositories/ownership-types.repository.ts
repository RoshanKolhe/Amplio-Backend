import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {OwnershipTypes, OwnershipTypesRelations} from '../models';

export class OwnershipTypesRepository extends TimeStampRepositoryMixin<
  OwnershipTypes,
  typeof OwnershipTypes.prototype.id,
  Constructor<
    DefaultCrudRepository<
      OwnershipTypes,
      typeof OwnershipTypes.prototype.id,
      OwnershipTypesRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(OwnershipTypes, dataSource);
  }
}
