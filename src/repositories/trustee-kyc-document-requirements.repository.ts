import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  TrusteeKycDocumentRequirements,
  TrusteeKycDocumentRequirementsRelations,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class TrusteeKycDocumentRequirementsRepository extends TimeStampRepositoryMixin<
  TrusteeKycDocumentRequirements,
  typeof TrusteeKycDocumentRequirements.prototype.id,
  Constructor<
    DefaultCrudRepository<
      TrusteeKycDocumentRequirements,
      typeof TrusteeKycDocumentRequirements.prototype.id,
      TrusteeKycDocumentRequirementsRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(TrusteeKycDocumentRequirements, dataSource);
  }
}
