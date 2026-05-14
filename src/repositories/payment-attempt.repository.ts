import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {PaymentAttempt, PaymentAttemptRelations} from '../models';

export class PaymentAttemptRepository extends TimeStampRepositoryMixin<
  PaymentAttempt,
  typeof PaymentAttempt.prototype.id,
  Constructor<
    DefaultCrudRepository<
      PaymentAttempt,
      typeof PaymentAttempt.prototype.id,
      PaymentAttemptRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(PaymentAttempt, dataSource);
  }
}
