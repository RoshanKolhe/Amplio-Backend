import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PtcFreeze, PtcFreezeRelations} from '../models';

export class PtcFreezeRepository extends TimeStampRepositoryMixin<
  PtcFreeze,
  typeof PtcFreeze.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PtcFreeze,
      typeof PtcFreeze.prototype.id,
      PtcFreezeRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(PtcFreeze, dataSource);
  }
}
