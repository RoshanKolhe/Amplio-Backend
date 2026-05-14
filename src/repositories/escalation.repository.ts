import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {Escalation, EscalationRelations} from '../models';

export class EscalationRepository extends TimeStampRepositoryMixin<
  Escalation,
  typeof Escalation.prototype.id,
  Constructor<
    DefaultCrudRepository<
      Escalation,
      typeof Escalation.prototype.id,
      EscalationRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
  ) {
    super(Escalation, dataSource);
  }
}
