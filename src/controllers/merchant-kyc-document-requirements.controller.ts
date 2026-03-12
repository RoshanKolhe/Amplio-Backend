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
import {MerchantKycDocumentRequirements} from '../models';
import {MerchantKycDocumentRequirementsRepository} from '../repositories';
import {
  MerchantKycDocumentRequirementsService,
  MerchantKycRequiredDocument,
} from '../services/merchant-kyc-document-requirements.service';

export class MerchantKycDocumentRequirementsController {
  constructor(
    @repository(MerchantKycDocumentRequirementsRepository)
    public merchantKycDocumentRequirementsRepository: MerchantKycDocumentRequirementsRepository,
    @inject('service.merchantKycDocumentRequirementsService.service')
    private merchantKycDocumentRequirementsService: MerchantKycDocumentRequirementsService,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/merchant-kyc-document-requirements')
  @response(200, {
    description: 'MerchantKycDocumentRequirements model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(MerchantKycDocumentRequirements),
      },
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(MerchantKycDocumentRequirements, {
            title: 'NewMerchantKycDocumentRequirements',
            exclude: ['id'],
          }),
        },
      },
    })
    merchantKycDocumentRequirements: Omit<
      MerchantKycDocumentRequirements,
      'id'
    >,
  ): Promise<MerchantKycDocumentRequirements> {
    return this.merchantKycDocumentRequirementsService.createRequirement(
      merchantKycDocumentRequirements,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/merchant-kyc-document-requirements/bulk')
  @response(200, {
    description: 'Bulk create merchant KYC document requirements',
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
                items: getModelSchemaRef(MerchantKycDocumentRequirements, {
                  title: 'NewMerchantKycDocumentRequirementsBulkItem',
                  exclude: ['id'],
                }),
              },
            },
          },
        },
      },
    })
    body: {
      requirements: Omit<MerchantKycDocumentRequirements, 'id'>[];
    },
  ): Promise<{
    success: boolean;
    count: number;
    data: MerchantKycDocumentRequirements[];
  }> {
    const created =
      await this.merchantKycDocumentRequirementsService.createBulkRequirements(
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
  @get('/merchant-kyc-document-requirements')
  @response(200, {
    description: 'Array of MerchantKycDocumentRequirements model instances',
  })
  async find(
    @param.filter(MerchantKycDocumentRequirements)
    filter?: Filter<MerchantKycDocumentRequirements>,
  ): Promise<MerchantKycDocumentRequirements[]> {
    return this.merchantKycDocumentRequirementsRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/merchant-kyc-document-requirements/{id}')
  @response(204, {
    description: 'MerchantKycDocumentRequirements PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(MerchantKycDocumentRequirements, {
            partial: true,
          }),
        },
      },
    })
    merchantKycDocumentRequirements: MerchantKycDocumentRequirements,
  ): Promise<void> {
    await this.merchantKycDocumentRequirementsService.updateRequirementById(
      id,
      merchantKycDocumentRequirements,
    );
  }

  @get('/merchant-kyc/{usersId}/required-documents')
  @response(200, {
    description: 'Required KYC documents for merchant',
  })
  async fetchRequiredDocuments(
    @param.path.string('usersId') usersId: string,
  ): Promise<{success: boolean; documents: MerchantKycRequiredDocument[]}> {
    const documents =
      await this.merchantKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    return {
      success: true,
      documents,
    };
  }
}
