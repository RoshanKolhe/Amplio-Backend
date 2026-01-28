import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {BusinessKycClientProfile, BusinessKycClientProfileRelations, BusinessKyc} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycRepository} from './business-kyc.repository';

export class BusinessKycClientProfileRepository extends TimeStampRepositoryMixin<
  BusinessKycClientProfile,
  typeof BusinessKycClientProfile.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycClientProfile,
      typeof BusinessKycClientProfile.prototype.id,
      BusinessKycClientProfileRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycClientProfile.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>,) {
    super(BusinessKycClientProfile, dataSource);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
  }
}
