import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {InvestmentMandate, InvestmentMandateRelations} from '../models';

export class InvestmentMandateRepository extends TimeStampRepositoryMixin<
  InvestmentMandate,
  typeof InvestmentMandate.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestmentMandate,
      typeof InvestmentMandate.prototype.id,
      InvestmentMandateRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(InvestmentMandate, dataSource);
  }
}
