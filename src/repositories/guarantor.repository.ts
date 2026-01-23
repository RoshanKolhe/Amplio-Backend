import {inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {Guarantor, GuarantorRelations} from '../models';

export class GuarantorRepository extends DefaultCrudRepository<
  Guarantor,
  typeof Guarantor.prototype.id,
  GuarantorRelations
> {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(Guarantor, dataSource);
  }
}
