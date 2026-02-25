import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  CompanyKycDocumentRequirements,
  CompanyKycDocumentRequirementsRelations,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class CompanyKycDocumentRequirementsRepository extends TimeStampRepositoryMixin<
  CompanyKycDocumentRequirements,
  typeof CompanyKycDocumentRequirements.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CompanyKycDocumentRequirements,
      typeof CompanyKycDocumentRequirements.prototype.id,
      CompanyKycDocumentRequirementsRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(CompanyKycDocumentRequirements, dataSource);
  }
}
