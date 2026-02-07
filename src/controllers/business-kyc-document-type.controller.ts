import {Filter, FilterExcludingWhere, repository} from '@loopback/repository';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  requestBody,
  response,
} from '@loopback/rest';
import {BusinessKycDocumentType} from '../models';
import {BusinessKycDocumentTypeRepository} from '../repositories';

export class BusinessKycDocumentTypeController {
  constructor(
    @repository(BusinessKycDocumentTypeRepository)
    public businessKycDocumentTypeRepository: BusinessKycDocumentTypeRepository,
  ) {}

  @post('/business-kyc-document-types')
  @response(200, {
    description: 'BusinessKycDocumentType model instance',
    content: {
      'application/json': {schema: getModelSchemaRef(BusinessKycDocumentType)},
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BusinessKycDocumentType, {
            title: 'NewBusinessKycDocumentType',
            exclude: ['id'],
          }),
        },
      },
    })
    businessKycDocumentType: Omit<BusinessKycDocumentType, 'id'>,
  ): Promise<BusinessKycDocumentType> {
    return this.businessKycDocumentTypeRepository.create(
      businessKycDocumentType,
    );
  }

  @get('/business-kyc-document-types')
  @response(200, {
    description: 'Array of BusinessKycDocumentType model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(BusinessKycDocumentType, {
            includeRelations: true,
          }),
        },
      },
    },
  })
  async find(
    @param.filter(BusinessKycDocumentType)
    filter?: Filter<BusinessKycDocumentType>,
  ): Promise<BusinessKycDocumentType[]> {
    return this.businessKycDocumentTypeRepository.find(filter);
  }

  @get('/business-kyc-document-types/{id}')
  @response(200, {
    description: 'BusinessKycDocumentType model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(BusinessKycDocumentType, {
          includeRelations: true,
        }),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(BusinessKycDocumentType, {exclude: 'where'})
    filter?: FilterExcludingWhere<BusinessKycDocumentType>,
  ): Promise<BusinessKycDocumentType> {
    return this.businessKycDocumentTypeRepository.findById(id, filter);
  }

  @patch('/business-kyc-document-types/{id}')
  @response(204, {
    description: 'BusinessKycDocumentType PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BusinessKycDocumentType, {partial: true}),
        },
      },
    })
    businessKycDocumentType: BusinessKycDocumentType,
  ): Promise<void> {
    await this.businessKycDocumentTypeRepository.updateById(
      id,
      businessKycDocumentType,
    );
  }

  // @del('/business-kyc-document-types/{id}')
  // @response(204, {
  //   description: 'BusinessKycDocumentType DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.businessKycDocumentTypeRepository.deleteById(id);
  // }
}
