import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycGuarantor, BusinessKycGuarantorRelations, BusinessKyc} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycRepository} from './business-kyc.repository';

export class BusinessKycGuarantorRepository extends TimeStampRepositoryMixin<
  BusinessKycGuarantor,
  typeof BusinessKycGuarantor.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycGuarantor,
      typeof BusinessKycGuarantor.prototype.id,
      BusinessKycGuarantorRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycGuarantor.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>,) {
    super(BusinessKycGuarantor, dataSource);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
  }
}
