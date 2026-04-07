import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {ComplianceAndDeclarations, ComplianceAndDeclarationsRelations} from '../models';

export class ComplianceAndDeclarationsRepository extends TimeStampRepositoryMixin<
  ComplianceAndDeclarations,
  typeof ComplianceAndDeclarations.prototype.id,
  Constructor<
    DefaultCrudRepository<
      ComplianceAndDeclarations,
      typeof ComplianceAndDeclarations.prototype.id,
      ComplianceAndDeclarationsRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(ComplianceAndDeclarations, dataSource);
  }
}
