import {inject} from '@loopback/core';
import {post, requestBody} from '@loopback/rest';
import {UsersConsent} from '../models';
import {UserConsentService} from '../services/user-consent.service';

export class UserConsentController {

  constructor(
    @inject('service.userConsentService.service')
    private consentService: UserConsentService,
  ) { }

  @post('/user-consents')
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['consentTemplateId'],
            properties: {
              consentTemplateId: {type: 'string'},
            },
          },
        },
      },
    })
    data: Partial<UsersConsent>,
  ): Promise<UsersConsent> {

    return this.consentService.createConsent(data);
  }
}
