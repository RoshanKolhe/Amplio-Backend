import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {InvestorType, InvestorTypeRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class InvestorTypeRepository extends TimeStampRepositoryMixin<
  InvestorType,
  typeof InvestorType.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorType,
      typeof InvestorType.prototype.id,
      InvestorTypeRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(InvestorType, dataSource);
  }
}
