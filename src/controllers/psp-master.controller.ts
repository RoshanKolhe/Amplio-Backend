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
import {PspMaster} from '../models';
import {PspMasterRepository} from '../repositories';
import {authenticate} from '@loopback/authentication';
import {authorize} from '../authorization';

export class PspMasterController {
  constructor(
    @repository(PspMasterRepository)
    public pspMasterRepository: PspMasterRepository,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/psp-masters')
  @response(200, {
    description: 'PspMaster model instance',
    content: {'application/json': {schema: getModelSchemaRef(PspMaster)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PspMaster, {
            title: 'NewPspMaster',
            exclude: ['id'],
          }),
        },
      },
    })
    pspMaster: Omit<PspMaster, 'id'>,
  ): Promise<PspMaster> {
    return this.pspMasterRepository.create(pspMaster);
  }

  @get('/psp-masters')
  @response(200, {
    description: 'Array of PspMaster model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(PspMaster, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(PspMaster) filter?: Filter<PspMaster>,
  ): Promise<PspMaster[]> {
    const finalFilter: Filter<PspMaster> = {
      ...filter,
      include: [
        {
          relation: 'pspMasterFields',
          scope: {
            order: ['order ASC'],
          },
        },
      ],
    };
    return this.pspMasterRepository.find(finalFilter);
  }

  @get('/psp-masters/{id}')
  @response(200, {
    description: 'PspMaster model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(PspMaster, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(PspMaster, {exclude: 'where'})
    filter?: FilterExcludingWhere<PspMaster>,
  ): Promise<PspMaster> {
    const finalFilter = {
      ...filter,
      include: [
        {
          relation: 'pspMasterFields',
          scope: {
            order: ['order ASC'],
          },
        },
      ],
    };

    return this.pspMasterRepository.findById(id, finalFilter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/psp-masters/{id}')
  @response(204, {
    description: 'PspMaster PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PspMaster, {partial: true}),
        },
      },
    })
    pspMaster: PspMaster,
  ): Promise<void> {
    await this.pspMasterRepository.updateById(id, pspMaster);
  }
}
