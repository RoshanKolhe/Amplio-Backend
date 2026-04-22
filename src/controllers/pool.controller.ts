import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param} from '@loopback/rest';
import {PoolService} from '../services/pool.service';

export class PoolController {
  constructor(
    @inject('service.pool.service')
    private poolService: PoolService,
  ) {}

  @authenticate('jwt')
  @get('/pool/{spvId}')
  async fetchPoolBySpvId(@param.path.string('spvId') spvId: string) {
    const pool = await this.poolService.getPoolBySpvId(spvId);

    return {
      success: true,
      message: 'Pool financials fetched successfully',
      pool,
    };
  }
}
