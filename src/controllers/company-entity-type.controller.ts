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
import {CompanyEntityType} from '../models';
import {CompanyEntityTypeRepository} from '../repositories';

export class CompanyEntityTypeController {
  constructor(
    @repository(CompanyEntityTypeRepository)
    public companyEntityTypeRepository: CompanyEntityTypeRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/company-entity-types')
  @response(200, {
    description: 'CompanyEntityType model instance',
    content: {'application/json': {schema: getModelSchemaRef(CompanyEntityType)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanyEntityType, {
            title: 'NewCompanyEntityType',
            exclude: ['id'],
          }),
        },
      },
    })
    companyEntityType: Omit<CompanyEntityType, 'id'>,
  ): Promise<CompanyEntityType> {
    return this.companyEntityTypeRepository.create(companyEntityType);
  }

  @get('/company-entity-types/count')
  @response(200, {
    description: 'CompanyEntityType model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(CompanyEntityType) where?: Where<CompanyEntityType>,
  ): Promise<Count> {
    return this.companyEntityTypeRepository.count(where);
  }

  @get('/company-entity-types')
  @response(200, {
    description: 'Array of CompanyEntityType model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(CompanyEntityType, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(CompanyEntityType) filter?: Filter<CompanyEntityType>,
  ): Promise<CompanyEntityType[]> {
    return this.companyEntityTypeRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-entity-types')
  @response(200, {
    description: 'CompanyEntityType PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanyEntityType, {partial: true}),
        },
      },
    })
    companyEntityType: CompanyEntityType,
    @param.where(CompanyEntityType) where?: Where<CompanyEntityType>,
  ): Promise<Count> {
    return this.companyEntityTypeRepository.updateAll(companyEntityType, where);
  }

  @get('/company-entity-types/{id}')
  @response(200, {
    description: 'CompanyEntityType model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(CompanyEntityType, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(CompanyEntityType, {exclude: 'where'}) filter?: FilterExcludingWhere<CompanyEntityType>
  ): Promise<CompanyEntityType> {
    return this.companyEntityTypeRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-entity-types/{id}')
  @response(204, {
    description: 'CompanyEntityType PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CompanyEntityType, {partial: true}),
        },
      },
    })
    companyEntityType: CompanyEntityType,
  ): Promise<void> {
    await this.companyEntityTypeRepository.updateById(id, companyEntityType);
  }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @put('/company-entity-types/{id}')
  // @response(204, {
  //   description: 'CompanyEntityType PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() companyEntityType: CompanyEntityType,
  // ): Promise<void> {
  //   await this.companyEntityTypeRepository.replaceById(id, companyEntityType);
  // }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @del('/company-entity-types/{id}')
  // @response(204, {
  //   description: 'CompanyEntityType DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.companyEntityTypeRepository.deleteById(id);
  // }
}
