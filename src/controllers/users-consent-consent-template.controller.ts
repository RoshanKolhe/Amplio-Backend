import {
  repository,
} from '@loopback/repository';
import {
  param,
  get,
  getModelSchemaRef,
} from '@loopback/rest';
import {
  UsersConsent,
  ConsentTemplate,
} from '../models';
import {UsersConsentRepository} from '../repositories';

export class UsersConsentConsentTemplateController {
  constructor(
    @repository(UsersConsentRepository)
    public usersConsentRepository: UsersConsentRepository,
  ) { }

  @get('/users-consents/{id}/consent-template', {
    responses: {
      '200': {
        description: 'ConsentTemplate belonging to UsersConsent',
        content: {
          'application/json': {
            schema: getModelSchemaRef(ConsentTemplate),
          },
        },
      },
    },
  })
  async getConsentTemplate(
    @param.path.string('id') id: typeof UsersConsent.prototype.id,
  ): Promise<ConsentTemplate> {
    return this.usersConsentRepository.consentTemplate(id);
  }
}
