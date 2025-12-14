import {authenticate} from '@loopback/authentication';
import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
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
import {CompanySectorType} from '../models';
import {CompanySectorTypeRepository} from '../repositories';

export class CompanySectorTypeController {
  constructor(
    @repository(CompanySectorTypeRepository)
    public companySectorTypeRepository: CompanySectorTypeRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/company-sector-types')
  @response(200, {
    description: 'CompanySectorType model instance',
    content: {'application/json': {schema: getModelSchemaRef(CompanySectorType)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanySectorType, {
            title: 'NewCompanySectorType',
            exclude: ['id'],
          }),
        },
      },
    })
    companySectorType: Omit<CompanySectorType, 'id'>,
  ): Promise<CompanySectorType> {
    return this.companySectorTypeRepository.create(companySectorType);
  }

  @get('/company-sector-types/count')
  @response(200, {
    description: 'CompanySectorType model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(CompanySectorType) where?: Where<CompanySectorType>,
  ): Promise<Count> {
    return this.companySectorTypeRepository.count(where);
  }

  @get('/company-sector-types')
  @response(200, {
    description: 'Array of CompanySectorType model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(CompanySectorType, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(CompanySectorType) filter?: Filter<CompanySectorType>,
  ): Promise<CompanySectorType[]> {
    return this.companySectorTypeRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-sector-types')
  @response(200, {
    description: 'CompanySectorType PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanySectorType, {partial: true}),
        },
      },
    })
    companySectorType: CompanySectorType,
    @param.where(CompanySectorType) where?: Where<CompanySectorType>,
  ): Promise<Count> {
    return this.companySectorTypeRepository.updateAll(companySectorType, where);
  }

  @get('/company-sector-types/{id}')
  @response(200, {
    description: 'CompanySectorType model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(CompanySectorType, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(CompanySectorType, {exclude: 'where'}) filter?: FilterExcludingWhere<CompanySectorType>
  ): Promise<CompanySectorType> {
    return this.companySectorTypeRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-sector-types/{id}')
  @response(204, {
    description: 'CompanySectorType PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanySectorType, {partial: true}),
        },
      },
    })
    companySectorType: CompanySectorType,
  ): Promise<void> {
    await this.companySectorTypeRepository.updateById(id, companySectorType);
  }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @put('/company-sector-types/{id}')
  // @response(204, {
  //   description: 'CompanySectorType PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() companySectorType: CompanySectorType,
  // ): Promise<void> {
  //   await this.companySectorTypeRepository.replaceById(id, companySectorType);
  // }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @del('/company-sector-types/{id}')
  // @response(204, {
  //   description: 'CompanySectorType DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.companySectorTypeRepository.deleteById(id);
  // }
}
