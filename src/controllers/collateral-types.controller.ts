import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  requestBody,
  response,
} from '@loopback/rest';
import {CollateralTypes} from '../models';
import {CollateralTypesRepository} from '../repositories';
import {authenticate} from '@loopback/authentication';
import {authorize} from '../authorization';

export class CollateralTypesController {
  constructor(
    @repository(CollateralTypesRepository)
    public collateralTypesRepository: CollateralTypesRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/collateral-types')
  @response(200, {
    description: 'CollateralTypes model instance',
    content: {'application/json': {schema: getModelSchemaRef(CollateralTypes)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CollateralTypes, {
            title: 'NewCollateralTypes',
            exclude: ['id'],
          }),
        },
      },
    })
    collateralTypes: Omit<CollateralTypes, 'id'>,
  ): Promise<CollateralTypes> {
    return this.collateralTypesRepository.create(collateralTypes);
  }

  @get('/collateral-types/count')
  @response(200, {
    description: 'CollateralTypes model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(CollateralTypes) where?: Where<CollateralTypes>,
  ): Promise<Count> {
    return this.collateralTypesRepository.count(where);
  }

  @get('/collateral-types')
  @response(200, {
    description: 'Array of CollateralTypes model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(CollateralTypes, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(CollateralTypes) filter?: Filter<CollateralTypes>,
  ): Promise<CollateralTypes[]> {
    return this.collateralTypesRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/collateral-types')
  @response(200, {
    description: 'CollateralTypes PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CollateralTypes, {partial: true}),
        },
      },
    })
    collateralTypes: CollateralTypes,
    @param.where(CollateralTypes) where?: Where<CollateralTypes>,
  ): Promise<Count> {
    return this.collateralTypesRepository.updateAll(collateralTypes, where);
  }

  @get('/collateral-types/{id}')
  @response(200, {
    description: 'CollateralTypes model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(CollateralTypes, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(CollateralTypes, {exclude: 'where'}) filter?: FilterExcludingWhere<CollateralTypes>
  ): Promise<CollateralTypes> {
    return this.collateralTypesRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/collateral-types/{id}')
  @response(204, {
    description: 'CollateralTypes PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CollateralTypes, {partial: true}),
        },
      },
    })
    collateralTypes: CollateralTypes,
  ): Promise<void> {
    await this.collateralTypesRepository.updateById(id, collateralTypes);
  }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @put('/collateral-types/{id}')
  // @response(204, {
  //   description: 'CollateralTypes PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() collateralTypes: CollateralTypes,
  // ): Promise<void> {
  //   await this.collateralTypesRepository.replaceById(id, collateralTypes);
  // }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @del('/collateral-types/{id}')
  // @response(204, {
  //   description: 'CollateralTypes DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.collateralTypesRepository.deleteById(id);
  // }
}
