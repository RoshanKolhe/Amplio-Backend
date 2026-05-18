import {inject} from '@loopback/core';
import {get, getModelSchemaRef, param, post, requestBody, response} from '@loopback/rest';
import {ConsentTemplate} from '../models';
import {ConsentTemplateService} from '../services/consent-template.service';

export class ConsentTemplateController {
  constructor(
    @inject('service.consentTemplateService.service')
    private consentTemplateService: ConsentTemplateService,
  ) { }

  @get('/consent-templates')
  @response(200, {
    description: 'Array of active consent templates',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(ConsentTemplate),
        },
      },
    },
  })
  async findAll(): Promise<ConsentTemplate[]> {
    return this.consentTemplateService.getAllTemplates();
  }

  @post('/consent-templates')
  @response(200, {
    description: 'ConsentTemplate model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ConsentTemplate),
      },
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ConsentTemplate, {
            title: 'NewConsentTemplate',
            exclude: ['id', 'verifiedAt', 'createdAt', 'updatedAt', 'deletedAt'],
          }),
        },
      },
    })
    consentTemplate: Omit<
      ConsentTemplate,
      'id' | 'verifiedAt' | 'createdAt' | 'updatedAt' | 'deletedAt'
    >,
  ): Promise<ConsentTemplate> {
    return this.consentTemplateService.createTemplate(consentTemplate);
  }

  @get('/consent-templates/slug/{slug}')
  @response(200, {
    description: 'Consent template fetched by permanent slug',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ConsentTemplate),
      },
    },
  })
  async findBySlug(
    @param.path.string('slug') slug: string,
  ): Promise<ConsentTemplate> {
    return this.consentTemplateService.getTemplateBySlug(slug);
  }
}
