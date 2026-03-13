import {
  Filter,
  FilterExcludingWhere,
  repository,
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
import {PspMasterFields} from '../models';
import {PspMasterFieldsRepository} from '../repositories';

export class PspMasterFieldsController {
  constructor(
    @repository(PspMasterFieldsRepository)
    public pspMasterFieldsRepository : PspMasterFieldsRepository,
  ) {}

  @post('/psp-master-fields')
  @response(200, {
    description: 'PspMasterFields model instance',
    content: {'application/json': {schema: getModelSchemaRef(PspMasterFields)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PspMasterFields, {
            title: 'NewPspMasterFields',
            exclude: ['id'],
          }),
        },
      },
    })
    pspMasterFields: Omit<PspMasterFields, 'id'>,
  ): Promise<PspMasterFields> {
    return this.pspMasterFieldsRepository.create(pspMasterFields);
  }

  @get('/psp-master-fields')
  @response(200, {
    description: 'Array of PspMasterFields model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(PspMasterFields, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(PspMasterFields) filter?: Filter<PspMasterFields>,
  ): Promise<PspMasterFields[]> {
    return this.pspMasterFieldsRepository.find(filter);
  }

  @get('/psp-master-fields/{id}')
  @response(200, {
    description: 'PspMasterFields model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(PspMasterFields, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(PspMasterFields, {exclude: 'where'}) filter?: FilterExcludingWhere<PspMasterFields>
  ): Promise<PspMasterFields> {
    return this.pspMasterFieldsRepository.findById(id, filter);
  }

  @patch('/psp-master-fields/{id}')
  @response(204, {
    description: 'PspMasterFields PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PspMasterFields, {partial: true}),
        },
      },
    })
    pspMasterFields: PspMasterFields,
  ): Promise<void> {
    await this.pspMasterFieldsRepository.updateById(id, pspMasterFields);
  }

  // @del('/psp-master-fields/{id}')
  // @response(204, {
  //   description: 'PspMasterFields DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.pspMasterFieldsRepository.deleteById(id);
  // }
}
