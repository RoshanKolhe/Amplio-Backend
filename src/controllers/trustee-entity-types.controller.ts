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
  response
} from '@loopback/rest';
import {authorize} from '../authorization';
import {TrusteeEntityTypes} from '../models';
import {TrusteeEntityTypesRepository} from '../repositories';

export class TrusteeEntityTypesController {
  constructor(
    @repository(TrusteeEntityTypesRepository)
    public trusteeEntityTypesRepository: TrusteeEntityTypesRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/trustee-entity-types')
  @response(200, {
    description: 'TrusteeEntityTypes model instance',
    content: {'application/json': {schema: getModelSchemaRef(TrusteeEntityTypes)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(TrusteeEntityTypes, {
            title: 'NewTrusteeEntityTypes',
            exclude: ['id'],
          }),
        },
      },
    })
    trusteeEntityTypes: Omit<TrusteeEntityTypes, 'id'>,
  ): Promise<TrusteeEntityTypes> {
    return this.trusteeEntityTypesRepository.create(trusteeEntityTypes);
  }

  @get('/trustee-entity-types/count')
  @response(200, {
    description: 'TrusteeEntityTypes model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(TrusteeEntityTypes) where?: Where<TrusteeEntityTypes>,
  ): Promise<Count> {
    return this.trusteeEntityTypesRepository.count(where);
  }

  @get('/trustee-entity-types')
  @response(200, {
    description: 'Array of TrusteeEntityTypes model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(TrusteeEntityTypes, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(TrusteeEntityTypes) filter?: Filter<TrusteeEntityTypes>,
  ): Promise<TrusteeEntityTypes[]> {
    return this.trusteeEntityTypesRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/trustee-entity-types')
  @response(200, {
    description: 'TrusteeEntityTypes PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(TrusteeEntityTypes, {partial: true}),
        },
      },
    })
    trusteeEntityTypes: TrusteeEntityTypes,
    @param.where(TrusteeEntityTypes) where?: Where<TrusteeEntityTypes>,
  ): Promise<Count> {
    return this.trusteeEntityTypesRepository.updateAll(trusteeEntityTypes, where);
  }

  @get('/trustee-entity-types/{id}')
  @response(200, {
    description: 'TrusteeEntityTypes model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(TrusteeEntityTypes, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(TrusteeEntityTypes, {exclude: 'where'}) filter?: FilterExcludingWhere<TrusteeEntityTypes>
  ): Promise<TrusteeEntityTypes> {
    return this.trusteeEntityTypesRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/trustee-entity-types/{id}')
  @response(204, {
    description: 'TrusteeEntityTypes PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(TrusteeEntityTypes, {partial: true}),
        },
      },
    })
    trusteeEntityTypes: TrusteeEntityTypes,
  ): Promise<void> {
    await this.trusteeEntityTypesRepository.updateById(id, trusteeEntityTypes);
  }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @put('/trustee-entity-types/{id}')
  // @response(204, {
  //   description: 'TrusteeEntityTypes PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() trusteeEntityTypes: TrusteeEntityTypes,
  // ): Promise<void> {
  //   await this.trusteeEntityTypesRepository.replaceById(id, trusteeEntityTypes);
  // }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @del('/trustee-entity-types/{id}')
  // @response(204, {
  //   description: 'TrusteeEntityTypes DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.trusteeEntityTypesRepository.deleteById(id);
  // }
}
