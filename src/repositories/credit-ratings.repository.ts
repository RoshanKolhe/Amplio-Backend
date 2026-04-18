import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {CreditRatings, CreditRatingsRelations} from '../models';

export class CreditRatingsRepository extends TimeStampRepositoryMixin<
  CreditRatings,
  typeof CreditRatings.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CreditRatings,
      typeof CreditRatings.prototype.id,
      CreditRatingsRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(CreditRatings, dataSource);
  }
}
