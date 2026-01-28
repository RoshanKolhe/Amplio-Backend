import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycAuditedFinancials, BusinessKycAuditedFinancialsRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';


export class BusinessKycAuditedFinancialsRepository extends TimeStampRepositoryMixin<
  BusinessKycAuditedFinancials,
  typeof BusinessKycAuditedFinancials.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycAuditedFinancials,
      typeof BusinessKycAuditedFinancials.prototype.id,
      BusinessKycAuditedFinancialsRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(BusinessKycAuditedFinancials, dataSource);
  }
}
