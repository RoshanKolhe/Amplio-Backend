import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {authorize} from '../authorization';
import {CompanyKycDocumentRequirements} from '../models';
import {CompanyKycDocumentRequirementsRepository} from '../repositories';
import {
  CompanyKycDocumentRequirementsService,
  CompanyKycRequiredDocument,
} from '../services/company-kyc-document-requirements.service';

export class CompanyKycDocumentRequirementsController {
  constructor(
    @repository(CompanyKycDocumentRequirementsRepository)
    public companyKycDocumentRequirementsRepository: CompanyKycDocumentRequirementsRepository,
    @inject('service.companyKycDocumentRequirementsService.service')
    private companyKycDocumentRequirementsService: CompanyKycDocumentRequirementsService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/company-kyc-document-requirements')
  @response(200, {
    description: 'CompanyKycDocumentRequirements model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(CompanyKycDocumentRequirements),
      },
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanyKycDocumentRequirements, {
            title: 'NewCompanyKycDocumentRequirements',
            exclude: ['id'],
          }),
        },
      },
    })
    companyKycDocumentRequirements: Omit<
      CompanyKycDocumentRequirements,
      'id'
    >,
  ): Promise<CompanyKycDocumentRequirements> {
    return this.companyKycDocumentRequirementsService.createRequirement(
      companyKycDocumentRequirements,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/company-kyc-document-requirements/bulk')
  @response(200, {
    description: 'Bulk create company KYC document requirements',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'count', 'data'],
          properties: {
            success: {type: 'boolean'},
            count: {type: 'number'},
            data: {
              type: 'array',
              items: getModelSchemaRef(CompanyKycDocumentRequirements),
            },
          },
        },
      },
    },
  })
  async createBulk(
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['requirements'],
            properties: {
              requirements: {
                type: 'array',
                items: getModelSchemaRef(CompanyKycDocumentRequirements, {
                  title: 'NewCompanyKycDocumentRequirementsBulkItem',
                  exclude: ['id'],
                }),
              },
            },
          },
        },
      },
    })
    body: {
      requirements: Omit<CompanyKycDocumentRequirements, 'id'>[];
    },
  ): Promise<{
    success: boolean;
    count: number;
    data: CompanyKycDocumentRequirements[];
  }> {
    const created =
      await this.companyKycDocumentRequirementsService.createBulkRequirements(
        body.requirements,
      );

    return {
      success: true,
      count: created.length,
      data: created,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-kyc-document-requirements')
  @response(200, {
    description: 'Array of CompanyKycDocumentRequirements model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(CompanyKycDocumentRequirements, {
            includeRelations: true,
          }),
        },
      },
    },
  })
  async find(
    @param.filter(CompanyKycDocumentRequirements)
    filter?: Filter<CompanyKycDocumentRequirements>,
  ): Promise<CompanyKycDocumentRequirements[]> {
    return this.companyKycDocumentRequirementsRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-kyc-document-requirements/{id}')
  @response(204, {
    description: 'CompanyKycDocumentRequirements PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanyKycDocumentRequirements, {
            partial: true,
          }),
        },
      },
    })
    companyKycDocumentRequirements: CompanyKycDocumentRequirements,
  ): Promise<void> {
    await this.companyKycDocumentRequirementsService.updateRequirementById(
      id,
      companyKycDocumentRequirements,
    );
  }

  @get('/company-kyc/{usersId}/required-documents')
  @response(200, {
    description: 'Required KYC documents for company',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'documents'],
          properties: {
            success: {type: 'boolean'},
            documents: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'id',
                  'documentLabel',
                  'documentValue',
                  'isMandatory',
                ],
                properties: {
                  id: {type: 'string'},
                  documentLabel: {type: 'string'},
                  documentValue: {type: 'string'},
                  isMandatory: {type: 'boolean'},
                },
              },
            },
          },
        },
      },
    },
  })
  async fetchRequiredDocuments(
    @param.path.string('usersId') usersId: string,
  ): Promise<{success: boolean; documents: CompanyKycRequiredDocument[]}> {
    const documents =
      await this.companyKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    return {
      success: true,
      documents,
    };
  }
}
