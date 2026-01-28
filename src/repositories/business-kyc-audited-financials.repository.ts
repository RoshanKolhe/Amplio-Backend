import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycAuditedFinancials, BusinessKycAuditedFinancialsRelations, BusinessKyc} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycRepository} from './business-kyc.repository';

export class BusinessKycAuditedFinancialsRepository extends TimeStampRepositoryMixin<
  BusinessKycAuditedFinancials,
  typeof BusinessKycAuditedFinancials.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycAuditedFinancials,
      typeof BusinessKycAuditedFinancials.prototype.id,
      BusinessKycAuditedFinancialsRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycAuditedFinancials.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>,) {
    super(BusinessKycAuditedFinancials, dataSource);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
  }
}
