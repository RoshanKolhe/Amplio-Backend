import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycProfile, BusinessKycProfileRelations} from '../models';

export class BusinessKycProfileRepository extends TimeStampRepositoryMixin<
  BusinessKycProfile,
  typeof BusinessKycProfile.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycProfile,
      typeof BusinessKycProfile.prototype.id,
      BusinessKycProfileRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(BusinessKycProfile, dataSource);
  }
}
