import {authenticate} from '@loopback/authentication';
import {Filter, repository} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  post,
  requestBody,
} from '@loopback/rest';
import {authorize} from '../authorization';
import {SpvApplicationStatusMaster} from '../models';
import {SpvApplicationStatusMasterRepository} from '../repositories';

export class SpvApplicationStatusMasterController {
  constructor(
    @repository(SpvApplicationStatusMasterRepository)
    public spvApplicationStatusMasterRepository: SpvApplicationStatusMasterRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['supper_admin']})
  @post('/spv-application-status-master')
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(SpvApplicationStatusMaster, {
            title: 'NewSpvApplicationStatusMaster',
            exclude: ['id'],
          }),
        },
      },
    })
    status: Omit<SpvApplicationStatusMaster, 'id'>,
  ): Promise<SpvApplicationStatusMaster> {
    return this.spvApplicationStatusMasterRepository.create(status);
  }

  @authenticate('jwt')
  @authorize({roles: ['supper_admin']})
  @get('/spv-application-status-master')
  async find(
    @param.filter(SpvApplicationStatusMaster)
    filter?: Filter<SpvApplicationStatusMaster>,
  ): Promise<SpvApplicationStatusMaster[]> {
    return this.spvApplicationStatusMasterRepository.find(filter);
  }
}
