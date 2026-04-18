import {inject} from '@loopback/core';
import {Filter, FilterExcludingWhere, repository} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {SpvKycDocumentType} from '../models';
import {SpvKycDocumentTypeRepository} from '../repositories';
import {SpvKycDocumentTypeService} from '../services/spv-kyc-document-type.service';

export class SpvKycDocumentTypeController {
  constructor(
    @repository(SpvKycDocumentTypeRepository)
    public spvKycDocumentTypeRepository: SpvKycDocumentTypeRepository,
    @inject('service.spvKycDocumentType.service')
    private spvKycDocumentTypeService: SpvKycDocumentTypeService,
  ) {}

  @post('/spv-kyc-document-types')
  @response(200, {
    description: 'SpvKycDocumentType model instance',
    content: {
      'application/json': {schema: getModelSchemaRef(SpvKycDocumentType)},
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(SpvKycDocumentType, {
            title: 'NewSpvKycDocumentType',
            exclude: ['id'],
          }),
        },
      },
    })
    spvKycDocumentType: Omit<SpvKycDocumentType, 'id'>,
  ): Promise<SpvKycDocumentType> {
    return this.spvKycDocumentTypeService.createDocumentType(
      spvKycDocumentType,
    );
  }

  @get('/spv-kyc-document-types')
  @response(200, {
    description: 'Array of SpvKycDocumentType model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(SpvKycDocumentType, {
            includeRelations: true,
          }),
        },
      },
    },
  })
  async find(
    @param.filter(SpvKycDocumentType)
    filter?: Filter<SpvKycDocumentType>,
  ): Promise<SpvKycDocumentType[]> {
    return this.spvKycDocumentTypeRepository.find(filter);
  }

  @get('/spv-kyc-document-types/{id}')
  @response(200, {
    description: 'SpvKycDocumentType model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(SpvKycDocumentType, {
          includeRelations: true,
        }),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(SpvKycDocumentType, {exclude: 'where'})
    filter?: FilterExcludingWhere<SpvKycDocumentType>,
  ): Promise<SpvKycDocumentType> {
    return this.spvKycDocumentTypeRepository.findById(id, filter);
  }

  @patch('/spv-kyc-document-types/{id}')
  @response(204, {
    description: 'SpvKycDocumentType PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(SpvKycDocumentType, {partial: true}),
        },
      },
    })
    spvKycDocumentType: SpvKycDocumentType,
  ): Promise<void> {
    await this.spvKycDocumentTypeRepository.updateById(id, spvKycDocumentType);
  }
}
