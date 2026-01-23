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
import {OwnershipTypes} from '../models';
import {OwnershipTypesRepository} from '../repositories';
import {authenticate} from '@loopback/authentication';
import {authorize} from '../authorization';

export class OwnershipTypesController {
  constructor(
    @repository(OwnershipTypesRepository)
    public ownershipTypesRepository: OwnershipTypesRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/ownership-types')
  @response(200, {
    description: 'OwnershipTypes model instance',
    content: {'application/json': {schema: getModelSchemaRef(OwnershipTypes)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(OwnershipTypes, {
            title: 'NewOwnershipTypes',
            exclude: ['id'],
          }),
        },
      },
    })
    ownershipTypes: Omit<OwnershipTypes, 'id'>,
  ): Promise<OwnershipTypes> {
    return this.ownershipTypesRepository.create(ownershipTypes);
  }

  @get('/ownership-types/count')
  @response(200, {
    description: 'OwnershipTypes model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(OwnershipTypes) where?: Where<OwnershipTypes>,
  ): Promise<Count> {
    return this.ownershipTypesRepository.count(where);
  }

  @get('/ownership-types')
  @response(200, {
    description: 'Array of OwnershipTypes model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(OwnershipTypes, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(OwnershipTypes) filter?: Filter<OwnershipTypes>,
  ): Promise<OwnershipTypes[]> {
    return this.ownershipTypesRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/ownership-types')
  @response(200, {
    description: 'OwnershipTypes PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(OwnershipTypes, {partial: true}),
        },
      },
    })
    ownershipTypes: OwnershipTypes,
    @param.where(OwnershipTypes) where?: Where<OwnershipTypes>,
  ): Promise<Count> {
    return this.ownershipTypesRepository.updateAll(ownershipTypes, where);
  }


  @get('/ownership-types/{id}')
  @response(200, {
    description: 'OwnershipTypes model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(OwnershipTypes, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(OwnershipTypes, {exclude: 'where'}) filter?: FilterExcludingWhere<OwnershipTypes>
  ): Promise<OwnershipTypes> {
    return this.ownershipTypesRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/ownership-types/{id}')
  @response(204, {
    description: 'OwnershipTypes PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(OwnershipTypes, {partial: true}),
        },
      },
    })
    ownershipTypes: OwnershipTypes,
  ): Promise<void> {
    await this.ownershipTypesRepository.updateById(id, ownershipTypes);
  }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @put('/ownership-types/{id}')
  // @response(204, {
  //   description: 'OwnershipTypes PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() ownershipTypes: OwnershipTypes,
  // ): Promise<void> {
  //   await this.ownershipTypesRepository.replaceById(id, ownershipTypes);
  // }

  // @authenticate('jwt')
  // @authorize({roles: ['super_admin']})
  // @del('/ownership-types/{id}')
  // @response(204, {
  //   description: 'OwnershipTypes DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.ownershipTypesRepository.deleteById(id);
  // }
}
