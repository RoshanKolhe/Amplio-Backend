import {Constructor, inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  MerchantKycDocumentRequirements,
  MerchantKycDocumentRequirementsRelations,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';

export class MerchantKycDocumentRequirementsRepository extends TimeStampRepositoryMixin<
  MerchantKycDocumentRequirements,
  typeof MerchantKycDocumentRequirements.prototype.id,
  Constructor<
    DefaultCrudRepository<
      MerchantKycDocumentRequirements,
      typeof MerchantKycDocumentRequirements.prototype.id,
      MerchantKycDocumentRequirementsRelations
    >
  >
>(DefaultCrudRepository) {
  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource) {
    super(MerchantKycDocumentRequirements, dataSource);
  }
}
