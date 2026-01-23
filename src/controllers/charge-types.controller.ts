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
import {ChargeTypes} from '../models';
import {ChargeTypesRepository} from '../repositories';
import {authenticate} from '@loopback/authentication';
import {authorize} from '../authorization';

export class ChargeTypesController {
  constructor(
    @repository(ChargeTypesRepository)
    public chargeTypesRepository: ChargeTypesRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/charge-types')
  @response(200, {
    description: 'ChargeTypes model instance',
    content: {'application/json': {schema: getModelSchemaRef(ChargeTypes)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ChargeTypes, {
            title: 'NewChargeTypes',
            exclude: ['id'],
          }),
        },
      },
    })
    chargeTypes: Omit<ChargeTypes, 'id'>,
  ): Promise<ChargeTypes> {
    return this.chargeTypesRepository.create(chargeTypes);
  }

  @get('/charge-types/count')
  @response(200, {
    description: 'ChargeTypes model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(ChargeTypes) where?: Where<ChargeTypes>,
  ): Promise<Count> {
    return this.chargeTypesRepository.count(where);
  }

  @get('/charge-types')
  @response(200, {
    description: 'Array of ChargeTypes model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(ChargeTypes, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(ChargeTypes) filter?: Filter<ChargeTypes>,
  ): Promise<ChargeTypes[]> {
    return this.chargeTypesRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/charge-types')
  @response(200, {
    description: 'ChargeTypes PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ChargeTypes, {partial: true}),
        },
      },
    })
    chargeTypes: ChargeTypes,
    @param.where(ChargeTypes) where?: Where<ChargeTypes>,
  ): Promise<Count> {
    return this.chargeTypesRepository.updateAll(chargeTypes, where);
  }

  @get('/charge-types/{id}')
  @response(200, {
    description: 'ChargeTypes model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ChargeTypes, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(ChargeTypes, {exclude: 'where'}) filter?: FilterExcludingWhere<ChargeTypes>
  ): Promise<ChargeTypes> {
    return this.chargeTypesRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/charge-types/{id}')
  @response(204, {
    description: 'ChargeTypes PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ChargeTypes, {partial: true}),
        },
      },
    })
    chargeTypes: ChargeTypes,
  ): Promise<void> {
    await this.chargeTypesRepository.updateById(id, chargeTypes);
  }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @put('/charge-types/{id}')
  // @response(204, {
  //   description: 'ChargeTypes PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() chargeTypes: ChargeTypes,
  // ): Promise<void> {
  //   await this.chargeTypesRepository.replaceById(id, chargeTypes);
  // }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @del('/charge-types/{id}')
  // @response(204, {
  //   description: 'ChargeTypes DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.chargeTypesRepository.deleteById(id);
  // }
}
