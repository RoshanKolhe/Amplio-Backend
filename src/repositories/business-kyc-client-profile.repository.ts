import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycClientProfile, BusinessKycClientProfileRelations} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';



export class BusinessKycClientProfileRepository extends TimeStampRepositoryMixin<
  BusinessKycClientProfile,
  typeof BusinessKycClientProfile.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycClientProfile,
      typeof BusinessKycClientProfile.prototype.id,
      BusinessKycClientProfileRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(BusinessKycClientProfile, dataSource);
  }
}
