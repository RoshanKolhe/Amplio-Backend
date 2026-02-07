import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {DocumentRoles, DocumentRolesRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {AmplioDataSource} from '../datasources';

export class DocumentRolesRepository extends TimeStampRepositoryMixin<
  DocumentRoles,
  typeof DocumentRoles.prototype.id,
  Constructor<
    DefaultCrudRepository<
      DocumentRoles,
      typeof DocumentRoles.prototype.id,
      DocumentRolesRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(DocumentRoles, dataSource);
  }
}
