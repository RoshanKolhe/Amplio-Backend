import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  InvestorKycDocumentRequirements,
  InvestorKycDocumentRequirementsRelations,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class InvestorKycDocumentRequirementsRepository extends TimeStampRepositoryMixin<
  InvestorKycDocumentRequirements,
  typeof InvestorKycDocumentRequirements.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorKycDocumentRequirements,
      typeof InvestorKycDocumentRequirements.prototype.id,
      InvestorKycDocumentRequirementsRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(InvestorKycDocumentRequirements, dataSource);
  }
}
