import {Constructor, inject, Getter} from '@loopback/core';
import {DefaultCrudRepository, repository, BelongsToAccessor} from '@loopback/repository';
import {AmplioDataSource} from '../datasources';
import {TimeStampRepositoryMixin} from '../mixins/timestamp-repository-mixin';
import {UsersConsent, UsersConsentRelations, ConsentTemplate} from '../models';
import {ConsentTemplateRepository} from './consent-template.repository';

export class UsersConsentRepository extends TimeStampRepositoryMixin<
  UsersConsent,
  typeof UsersConsent.prototype.id,
  Constructor<
    DefaultCrudRepository<
      UsersConsent,
      typeof UsersConsent.prototype.id,
      UsersConsentRelations
    >
  >
>(DefaultCrudRepository) {

  public readonly consentTemplate: BelongsToAccessor<ConsentTemplate, typeof UsersConsent.prototype.id>;

  constructor(
    @inject('datasources.amplio') dataSource: AmplioDataSource, @repository.getter('ConsentTemplateRepository') protected consentTemplateRepositoryGetter: Getter<ConsentTemplateRepository>,
  ) {
    super(UsersConsent, dataSource);
    this.consentTemplate = this.createBelongsToAccessorFor('consentTemplate', consentTemplateRepositoryGetter,);
    this.registerInclusionResolver('consentTemplate', this.consentTemplate.inclusionResolver);
  }
}
