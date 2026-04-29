import {
  authenticate,
  AuthenticationBindings,
} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, HttpErrors, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {WithdrawalRequest} from '../models';
import {WalletWithdrawalService} from '../services/wallet-withdrawal.service';

export class WalletWithdrawalController {
  constructor(
    @inject('service.walletWithdrawal.service')
    private walletWithdrawalService: WalletWithdrawalService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/wallet')
  async getWallet(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ) {
    const wallet = await this.walletWithdrawalService.getWallet(currentUser);

    return {
      success: true,
      wallet,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/wallet/history')
  async getWalletHistory(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ) {
    const transactions =
      await this.walletWithdrawalService.getWalletHistory(currentUser);

    return {
      success: true,
      transactions,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/wallet/deposit')
  async addFunds(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['amount'],
            properties: {
              amount: {type: 'number'},
              remarks: {type: 'string'},
              idempotencyKey: {type: 'string', minLength: 8, maxLength: 120},
              externalTransactionId: {
                type: 'string',
                minLength: 8,
                maxLength: 120,
              },
            },
          },
        },
      },
    })
    body: {
      amount: number;
      remarks?: string;
      idempotencyKey?: string;
      externalTransactionId?: string;
    },
  ) {
    const deposit = await this.walletWithdrawalService.addFunds(
      currentUser,
      body.amount,
      body.remarks,
      {
        idempotencyKey: body.idempotencyKey,
        externalTransactionId: body.externalTransactionId,
      },
    );

    return {
      success: true,
      message: 'Funds added successfully',
      ...deposit,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/wallet/withdraw')
  async requestWithdrawal(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['amount'],
            properties: {
              amount: {type: 'number'},
              remarks: {type: 'string'},
            },
          },
        },
      },
    })
    body: {amount: number; remarks?: string},
  ) {
    const withdrawalRequest = await this.walletWithdrawalService.requestWithdrawal(
      currentUser,
      body.amount,
      body.remarks,
    );

    return {
      success: true,
      message: 'Withdrawal request created successfully',
      withdrawalRequest,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin', 'admin']})
  @post('/wallet/withdraw/{requestId}/process')
  async processWithdrawal(
    @param.path.string('requestId') requestId: string,
  ): Promise<{
    success: boolean;
    message: string;
    withdrawalRequest: WithdrawalRequest;
  }> {
    try {
      const withdrawalRequest =
        await this.walletWithdrawalService.processWithdrawal(requestId);

      return {
        success: true,
        message: 'Withdrawal processed successfully',
        withdrawalRequest,
      };
    } catch (error) {
      if (error instanceof HttpErrors.HttpError) {
        throw error;
      }

      throw new HttpErrors.InternalServerError('Withdrawal processing failed');
    }
  }
}
