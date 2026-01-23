import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {Guarantor, GuarantorRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class GuarantorRepository extends TimeStampRepositoryMixin<
  Guarantor,
  typeof Guarantor.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Guarantor,
      typeof Guarantor.prototype.id,
      GuarantorRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(Guarantor, dataSource);
  }
}
