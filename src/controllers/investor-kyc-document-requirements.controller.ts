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
import {InvestorKycDocumentRequirements} from '../models';
import {InvestorKycDocumentRequirementsRepository} from '../repositories';
import {
  InvestorKycDocumentRequirementsService,
  InvestorKycRequiredDocument,
} from '../services/investor-kyc-document-requirements.service';

export class InvestorKycDocumentRequirementsController {
  constructor(
    @repository(InvestorKycDocumentRequirementsRepository)
    public investorKycDocumentRequirementsRepository: InvestorKycDocumentRequirementsRepository,
    @inject('service.investorKycDocumentRequirementsService.service')
    private investorKycDocumentRequirementsService: InvestorKycDocumentRequirementsService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/investor-kyc-document-requirements')
  @response(200, {
    description: 'InvestorKycDocumentRequirements model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(InvestorKycDocumentRequirements),
      },
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(InvestorKycDocumentRequirements, {
            title: 'NewInvestorKycDocumentRequirements',
            exclude: ['id'],
          }),
        },
      },
    })
    investorKycDocumentRequirements: Omit<
      InvestorKycDocumentRequirements,
      'id'
    >,
  ): Promise<InvestorKycDocumentRequirements> {
    return this.investorKycDocumentRequirementsService.createRequirement(
      investorKycDocumentRequirements,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/investor-kyc-document-requirements/bulk')
  @response(200, {
    description: 'Bulk create investor KYC document requirements',
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
              items: getModelSchemaRef(InvestorKycDocumentRequirements),
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
                items: getModelSchemaRef(InvestorKycDocumentRequirements, {
                  title: 'NewInvestorKycDocumentRequirementsBulkItem',
                  exclude: ['id'],
                }),
              },
            },
          },
        },
      },
    })
    body: {
      requirements: Omit<InvestorKycDocumentRequirements, 'id'>[];
    },
  ): Promise<{
    success: boolean;
    count: number;
    data: InvestorKycDocumentRequirements[];
  }> {
    const created =
      await this.investorKycDocumentRequirementsService.createBulkRequirements(
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
  @get('/investor-kyc-document-requirements')
  @response(200, {
    description: 'Array of InvestorKycDocumentRequirements model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(InvestorKycDocumentRequirements, {
            includeRelations: true,
          }),
        },
      },
    },
  })
  async find(
    @param.filter(InvestorKycDocumentRequirements)
    filter?: Filter<InvestorKycDocumentRequirements>,
  ): Promise<InvestorKycDocumentRequirements[]> {
    return this.investorKycDocumentRequirementsRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/investor-kyc-document-requirements/{id}')
  @response(204, {
    description: 'InvestorKycDocumentRequirements PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(InvestorKycDocumentRequirements, {
            partial: true,
          }),
        },
      },
    })
    investorKycDocumentRequirements: InvestorKycDocumentRequirements,
  ): Promise<void> {
    await this.investorKycDocumentRequirementsService.updateRequirementById(
      id,
      investorKycDocumentRequirements,
    );
  }

  @get('/investor-kyc/{usersId}/required-documents')
  @response(200, {
    description: 'Required KYC documents for investor',
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
  ): Promise<{success: boolean; documents: InvestorKycRequiredDocument[]}> {
    const documents =
      await this.investorKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    return {
      success: true,
      documents,
    };
  }
}
