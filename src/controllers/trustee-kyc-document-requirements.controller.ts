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
import {TrusteeKycDocumentRequirements} from '../models';
import {TrusteeKycDocumentRequirementsRepository} from '../repositories';
import {
  TrusteeKycDocumentRequirementsService,
  TrusteeKycRequiredDocument,
} from '../services/trustee-kyc-document-requirements.service';

export class TrusteeKycDocumentRequirementsController {
  constructor(
    @repository(TrusteeKycDocumentRequirementsRepository)
    public trusteeKycDocumentRequirementsRepository: TrusteeKycDocumentRequirementsRepository,
    @inject('service.trusteeKycDocumentRequirementsService.service')
    private trusteeKycDocumentRequirementsService: TrusteeKycDocumentRequirementsService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/trustee-kyc-document-requirements')
  @response(200, {
    description: 'TrusteeKycDocumentRequirements model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(TrusteeKycDocumentRequirements),
      },
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(TrusteeKycDocumentRequirements, {
            title: 'NewTrusteeKycDocumentRequirements',
            exclude: ['id'],
          }),
        },
      },
    })
    trusteeKycDocumentRequirements: Omit<TrusteeKycDocumentRequirements, 'id'>,
  ): Promise<TrusteeKycDocumentRequirements> {
    return this.trusteeKycDocumentRequirementsService.createRequirement(
      trusteeKycDocumentRequirements,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/trustee-kyc-document-requirements/bulk')
  @response(200, {
    description: 'Bulk create trustee KYC document requirements',
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
                items: getModelSchemaRef(TrusteeKycDocumentRequirements, {
                  title: 'NewTrusteeKycDocumentRequirementsBulkItem',
                  exclude: ['id'],
                }),
              },
            },
          },
        },
      },
    })
    body: {
      requirements: Omit<TrusteeKycDocumentRequirements, 'id'>[];
    },
  ): Promise<{
    success: boolean;
    count: number;
    data: TrusteeKycDocumentRequirements[];
  }> {
    const created =
      await this.trusteeKycDocumentRequirementsService.createBulkRequirements(
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
  @get('/trustee-kyc-document-requirements')
  @response(200, {
    description: 'Array of TrusteeKycDocumentRequirements model instances',
  })
  async find(
    @param.filter(TrusteeKycDocumentRequirements)
    filter?: Filter<TrusteeKycDocumentRequirements>,
  ): Promise<TrusteeKycDocumentRequirements[]> {
    return this.trusteeKycDocumentRequirementsRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/trustee-kyc-document-requirements/{id}')
  @response(204, {
    description: 'TrusteeKycDocumentRequirements PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(TrusteeKycDocumentRequirements, {
            partial: true,
          }),
        },
      },
    })
    trusteeKycDocumentRequirements: TrusteeKycDocumentRequirements,
  ): Promise<void> {
    await this.trusteeKycDocumentRequirementsService.updateRequirementById(
      id,
      trusteeKycDocumentRequirements,
    );
  }

  @get('/trustee-kyc/{usersId}/required-documents')
  @response(200, {
    description: 'Required KYC documents for trustee',
  })
  async fetchRequiredDocuments(
    @param.path.string('usersId') usersId: string,
  ): Promise<{success: boolean; documents: TrusteeKycRequiredDocument[]}> {
    const documents =
      await this.trusteeKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    return {
      success: true,
      documents,
    };
  }
}
