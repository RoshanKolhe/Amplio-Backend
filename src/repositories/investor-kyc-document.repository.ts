import {Constructor, Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {
  InvestorKycDocument,
  InvestorKycDocumentRelations,
  InvestorKycDocumentRequirements,
  Media,
  Users,
} from '../models';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {InvestorKycDocumentRequirementsRepository} from './investor-kyc-document-requirements.repository';
import {MediaRepository} from './media.repository';
import {UsersRepository} from './users.repository';

export class InvestorKycDocumentRepository extends TimeStampRepositoryMixin<
  InvestorKycDocument,
  typeof InvestorKycDocument.prototype.id,
  Constructor<
    DefaultCrudRepository<
      InvestorKycDocument,
      typeof InvestorKycDocument.prototype.id,
      InvestorKycDocumentRelations
    >
  >
>(DefaultCrudRepository) {
  public readonly investorKycDocumentRequirements: BelongsToAccessor<
    InvestorKycDocumentRequirements,
    typeof InvestorKycDocument.prototype.id
  >;

  public readonly media: BelongsToAccessor<
    Media,
    typeof InvestorKycDocument.prototype.id
  >;

  public readonly users: BelongsToAccessor<
    Users,
    typeof InvestorKycDocument.prototype.id
  >;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource,
    @repository.getter('InvestorKycDocumentRequirementsRepository')
    protected investorKycDocumentRequirementsRepositoryGetter: Getter<InvestorKycDocumentRequirementsRepository>,
    @repository.getter('MediaRepository')
    protected mediaRepositoryGetter: Getter<MediaRepository>,
    @repository.getter('UsersRepository')
    protected usersRepositoryGetter: Getter<UsersRepository>,
  ) {
    super(InvestorKycDocument, dataSource);
    this.users = this.createBelongsToAccessorFor('users', usersRepositoryGetter);
    this.registerInclusionResolver('users', this.users.inclusionResolver);
    this.media = this.createBelongsToAccessorFor('media', mediaRepositoryGetter);
    this.registerInclusionResolver('media', this.media.inclusionResolver);
    this.investorKycDocumentRequirements = this.createBelongsToAccessorFor(
      'investorKycDocumentRequirements',
      investorKycDocumentRequirementsRepositoryGetter,
    );
    this.registerInclusionResolver(
      'investorKycDocumentRequirements',
      this.investorKycDocumentRequirements.inclusionResolver,
    );
  }
}
