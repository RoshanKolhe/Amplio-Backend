import {inject} from '@loopback/core';
import {get, param, patch, post, requestBody} from '@loopback/rest';
import {HttpErrors} from '@loopback/rest';
import {UsersConsent} from '../models';
import {UserConsentService} from '../services/user-consent.service';

export class UserConsentController {

  constructor(
    @inject('service.userConsentService.service')
    private consentService: UserConsentService,
  ) { }

  @get('/user-consents')
  async findConsents(
    @param.query.string('sessionId') sessionId?: string,
    @param.query.string('identifierId') identifierId?: string,
  ): Promise<UsersConsent[]> {
    if (sessionId) {
      return this.consentService.fetchConsentsBySessionId(sessionId);
    }

    if (identifierId) {
      return this.consentService.fetchConsentsByIdentifierId(identifierId);
    }

    throw new HttpErrors.BadRequest(
      'Either sessionId or identifierId is required',
    );
  }

  @post('/user-consents')
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['consentTemplateId', 'isChecked'],
            properties: {
              consentTemplateId: {type: 'string'},
              isChecked: {type: 'boolean'},
              identifierId: {type: 'string'},
              sessionId: {type: 'string'},
            },
          },
        },
      },
    })
    data: Partial<UsersConsent>,
  ): Promise<UsersConsent> {

    return this.consentService.createConsent(data);
  }

  @patch('/user-consents')
  async update(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['consentTemplateId', 'isChecked'],
            properties: {
              consentTemplateId: {type: 'string'},
              isChecked: {type: 'boolean'},
              identifierId: {type: 'string'},
              sessionId: {type: 'string'},
            },
          },
        },
      },
    })
    data: Partial<UsersConsent>,
  ): Promise<UsersConsent> {
    return this.consentService.updateConsent(data);
  }
}
