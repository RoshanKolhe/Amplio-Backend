import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {MerchantPayoutBatch, MerchantPayoutBatchRelations} from '../models';

export class MerchantPayoutBatchRepository extends TimeStampRepositoryMixin<
  MerchantPayoutBatch,
  typeof MerchantPayoutBatch.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantPayoutBatch,
      typeof MerchantPayoutBatch.prototype.id,
      MerchantPayoutBatchRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(MerchantPayoutBatch, dataSource);
  }
}
