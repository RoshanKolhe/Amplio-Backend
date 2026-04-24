import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param} from '@loopback/rest';
import {PoolService} from '../services/pool.service';
import {PtcIssuanceService} from '../services/ptc-issuance.service';

export class PoolController {
  constructor(
    @inject('service.pool.service')
    private poolService: PoolService,
    @inject('service.ptcIssuance.service')
    private ptcIssuanceService: PtcIssuanceService,
  ) {}

  @authenticate('jwt')
  @get('/pool/{spvId}')
  async fetchPoolBySpvId(@param.path.string('spvId') spvId: string) {
    const {pool, poolSummary} = await this.poolService.getPoolDetailsBySpvId(spvId);
    const ptcInventory = await this.ptcIssuanceService
      .fetchInventoryForSpv(spvId)
      .catch(() => null);

    return {
      success: true,
      message: 'Pool financials fetched successfully',
      pool,
      poolSummary,
      ptcInventory,
    };
  }
}
