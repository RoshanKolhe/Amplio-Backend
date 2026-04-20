import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {
  MerchantPayoutConfig,
  MerchantPayoutConfigRelations,
} from '../models';

export class MerchantPayoutConfigRepository extends TimeStampRepositoryMixin<
  MerchantPayoutConfig,
  typeof MerchantPayoutConfig.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantPayoutConfig,
      typeof MerchantPayoutConfig.prototype.id,
      MerchantPayoutConfigRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(MerchantPayoutConfig, dataSource);
  }
}
