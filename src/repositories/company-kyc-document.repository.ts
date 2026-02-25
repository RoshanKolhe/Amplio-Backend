import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {CompanyKycDocument, CompanyKycDocumentRelations, CompanyKycDocumentRequirements, Media, Users} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {CompanyKycDocumentRequirementsRepository} from './company-kyc-document-requirements.repository';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';

export class CompanyKycDocumentRepository extends TimeStampRepositoryMixin<
  CompanyKycDocument,
  typeof CompanyKycDocument.prototype.id,
  Constructor<
    DefaultCrudRepository<
      CompanyKycDocument,
      typeof CompanyKycDocument.prototype.id,
      CompanyKycDocumentRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly companyKycDocumentRequirements: BelongsToAccessor<CompanyKycDocumentRequirements, typeof CompanyKycDocument.prototype.id>;

  public readonly media: BelongsToAccessor<Media, typeof CompanyKycDocument.prototype.id>;

  public readonly users: BelongsToAccessor<Users, typeof CompanyKycDocument.prototype.id>;

  constructor(@inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('CompanyKycDocumentRequirementsRepository') protected companyKycDocumentRequirementsRepositoryGetter: Getter<CompanyKycDocumentRequirementsRepository>, @repository.getter('MediaRepository') protected mediaRepositoryGetter: Getter<MediaRepository>, @repository.getter('UsersRepository') protected usersRepositoryGetter: Getter<UsersRepository>,) {
    super(CompanyKycDocument, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter,);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter,);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
    this.companyKycDocumentRequirements = this.createBelongsToAccessorFor('companyKycDocumentRequirements', companyKycDocumentRequirementsRepositoryGetter,);
    this.registerInclusionResolver('companyKycDocumentRequirements', this.companyKycDocumentRequirements.inclusionResolver);
  }
}
