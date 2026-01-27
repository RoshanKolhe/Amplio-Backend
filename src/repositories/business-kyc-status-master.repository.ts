import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycStatusMaster, BusinessKycStatusMasterRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class BusinessKycStatusMasterRepository extends TimeStampRepositoryMixin<
  BusinessKycStatusMaster,
  typeof BusinessKycStatusMaster.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycStatusMaster,
      typeof BusinessKycStatusMaster.prototype.id,
      BusinessKycStatusMasterRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(BusinessKycStatusMaster, dataSource);
  }
}
