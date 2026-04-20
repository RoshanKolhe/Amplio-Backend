import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  MerchantPayoutBatchItem,
  MerchantPayoutBatchItemRelations,
} from '../models';

export class MerchantPayoutBatchItemRepository extends TimeStampRepositoryMixin<
  MerchantPayoutBatchItem,
  typeof MerchantPayoutBatchItem.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantPayoutBatchItem,
      typeof MerchantPayoutBatchItem.prototype.id,
      MerchantPayoutBatchItemRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(MerchantPayoutBatchItem, dataSource);
  }
}
