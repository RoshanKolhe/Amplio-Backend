import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {ConsentTemplate, ConsentTemplateRelations} from '../models';


export class ConsentTemplateRepository extends TimeStampRepositoryMixin<
  ConsentTemplate,
  typeof ConsentTemplate.prototype.id,
  Constructor<
    DefaultCrudRepository<
      ConsentTemplate,
      typeof ConsentTemplate.prototype.id,
      ConsentTemplateRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(ConsentTemplate, dataSource);
  }
}
