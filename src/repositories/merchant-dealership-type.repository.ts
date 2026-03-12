import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MerchantDealershipType, MerchantDealershipTypeRelations} from '../models';

export class MerchantDealershipTypeRepository extends TimeStampRepositoryMixin<
  MerchantDealershipType,
  typeof MerchantDealershipType.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantDealershipType,
      typeof MerchantDealershipType.prototype.id,
      MerchantDealershipTypeRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(MerchantDealershipType, dataSource);
  }
}
