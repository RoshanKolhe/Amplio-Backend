import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {InvestorInvestmentsService} from '../services/investor-investments.service';
import {PoolService} from '../services/pool.service';
import {PtcIssuanceService} from '../services/ptc-issuance.service';
import {WalletWithdrawalService} from '../services/wallet-withdrawal.service';

export interface BuyPtcRequest {
  units: number;
  allowPartialAllocation?: boolean;
  idempotencyKey?: string;
}

export class PtcController {
  constructor(
    @inject('service.pool.service')
    private poolService: PoolService,
    @inject('service.ptcIssuance.service')
    private ptcIssuanceService: PtcIssuanceService,
    @inject('service.investorInvestments.service')
    private investorInvestmentsService: InvestorInvestmentsService,
    @inject('service.walletWithdrawal.service')
    private walletWithdrawalService: WalletWithdrawalService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/ptc/{spvId}')
  async getPtcData(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
  ) {
    const {pool, poolSummary} =
      await this.poolService.getPoolDetailsBySpvId(spvId);
    const ptcInventory = await this.ptcIssuanceService.fetchInventoryForSpv(
      spvId,
      currentUser.id,
    );
    const wallet = await this.walletWithdrawalService.getWallet(currentUser);

    return {
      success: true,
      message: 'PTC data fetched successfully',
      data: {
        spvId,
        wallet,
        pool,
        poolSummary,
        ptcInventory,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/ptc/{spvId}/buy')
  async buyPtc(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['units'],
            additionalProperties: false,
            properties: {
              units: {
                type: 'integer',
                minimum: 1,
              },
              allowPartialAllocation: {
                type: 'boolean',
                default: false,
              },
              idempotencyKey: {
                type: 'string',
                minLength: 8,
                maxLength: 80,
              },
            },
          },
        },
      },
    })
    body: BuyPtcRequest,
  ) {
    const allocation =
      await this.investorInvestmentsService.buyInvestorInvestment(
        currentUser,
        spvId,
        body.units,
        {
          allowPartialAllocation: body.allowPartialAllocation,
          idempotencyKey: body.idempotencyKey,
        },
      );
    const ptcInventory = await this.ptcIssuanceService.fetchInventoryForSpv(
      spvId,
      currentUser.id,
    );

    const wallet = await this.walletWithdrawalService.getWallet(currentUser);

    return {
      success: true,
      message: allocation.partialAllocation
        ? 'PTC units partially allocated based on availability'
        : 'PTC units purchased successfully',
      data: {
        allocation,
        wallet,
        ptcInventory,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/ptc/{spvId}/redeem')
  async redeemPtc(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['units'],
            properties: {
              units: {
                type: 'integer',
                minimum: 1,
              },
            },
          },
        },
      },
    })
    body: {units: number},
  ) {
    const redemption = await this.ptcIssuanceService.redeemUnits(
      currentUser,
      spvId,
      body.units,
    );
    const ptcInventory = await this.ptcIssuanceService.fetchInventoryForSpv(
      spvId,
      currentUser.id,
    );
    const wallet = await this.walletWithdrawalService.getWallet(currentUser);

    return {
      success: true,
      message: 'PTC units redeemed successfully',
      data: {
        redemption,
        wallet,
        ptcInventory,
      },
    };
  }
}
