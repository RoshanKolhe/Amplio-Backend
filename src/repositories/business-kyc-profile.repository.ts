import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {BusinessKycProfile, BusinessKycProfileRelations, BusinessKyc} from '../models';
import {BusinessKycRepository} from './business-kyc.repository';

export class BusinessKycProfileRepository extends TimeStampRepositoryMixin<
  BusinessKycProfile,
  typeof BusinessKycProfile.prototype.id,
  Constructor<
    DefaultCrudRepository<
      BusinessKycProfile,
      typeof BusinessKycProfile.prototype.id,
      BusinessKycProfileRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly businessKyc: BelongsToAccessor<BusinessKyc, typeof BusinessKycProfile.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('BusinessKycRepository') protected businessKycRepositoryGetter: Getter<BusinessKycRepository>,) {
    super(BusinessKycProfile, dataSource);
    this.businessKyc = this.createBelongsToAccessorFor('businessKyc', businessKycRepositoryGetter,);
    this.registerInclusionResolver('businessKyc', this.businessKyc.inclusionResolver);
  }
}
