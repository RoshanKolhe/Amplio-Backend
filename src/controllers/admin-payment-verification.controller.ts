import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {RedemptionPayoutStatus} from '../models';
import {RedemptionPayoutService} from '../services/redemption-payout.service';
import {SpvPaymentVerificationService} from '../services/spv-payment-verification.service';

export class AdminPaymentVerificationController {
  constructor(
    @inject('service.spvPaymentVerification.service')
    private spvPaymentVerificationService: SpvPaymentVerificationService,
    @inject('service.redemptionPayout.service')
    private redemptionPayoutService: RedemptionPayoutService,
  ) {}

  // ─── Verification Dashboard ─────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/payment-verifications')
  async listVerifications(
    @param.query.string('spvId') spvId?: string,
    @param.query.string('status') status?: string,
    @param.query.string('investorProfileId') investorProfileId?: string,
    @param.query.string('utrNumber') utrNumber?: string,
    @param.query.string('fromDate') fromDate?: string,
    @param.query.string('toDate') toDate?: string,
    @param.query.number('minAmount') minAmount?: number,
    @param.query.number('maxAmount') maxAmount?: number,
    @param.query.string('search') search?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('offset') offset?: number,
    @param.query.string('sortBy') sortBy?: string,
    @param.query.string('sortOrder') sortOrder?: string,
  ) {
    const result =
      await this.spvPaymentVerificationService.listVerificationsForAdmin({
        spvId,
        status,
        investorProfileId,
        utrNumber,
        fromDate,
        toDate,
        minAmount,
        maxAmount,
        search,
        limit,
        offset,
        sortBy: sortBy as 'createdAt' | 'amount' | 'updatedAt' | 'verifiedAt',
        sortOrder: sortOrder as 'ASC' | 'DESC',
      });

    return {
      success: true,
      message: 'Verifications fetched successfully',
      data: result.data,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/payment-verifications/{verificationId}')
  async getVerificationDetail(
    @param.path.string('verificationId') verificationId: string,
  ) {
    const verification =
      await this.spvPaymentVerificationService.getVerificationById(
        verificationId,
      );

    return {
      success: true,
      message: 'Verification fetched successfully',
      data: verification,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/payment-verifications/{verificationId}/details')
  async getVerificationEnrichedDetail(
    @param.path.string('verificationId') verificationId: string,
  ) {
    const detail =
      await this.spvPaymentVerificationService.getVerificationWithDetails(
        verificationId,
      );

    return {
      success: true,
      message: 'Verification details fetched successfully',
      data: detail,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/payment-verifications/{verificationId}/timeline')
  async getVerificationTimeline(
    @param.path.string('verificationId') verificationId: string,
  ) {
    const timeline =
      await this.spvPaymentVerificationService.getTransactionTimeline(
        verificationId,
      );

    return {
      success: true,
      message: 'Verification timeline fetched successfully',
      data: timeline,
    };
  }

  // ─── Verification Actions ────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/admin/payment-verifications/{verificationId}/approve')
  async approveVerification(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['verifiedAmount'],
            additionalProperties: false,
            properties: {
              verifiedAmount: {type: 'number', minimum: 0.01},
              status: {type: 'number', enum: [1]},
            },
          },
        },
      },
    })
    body: {verifiedAmount: number; status?: number},
  ) {
    const verification =
      await this.spvPaymentVerificationService.approveVerification(
        verificationId,
        body.verifiedAmount,
        currentUser.id,
      );

    return {
      success: true,
      message: 'Verification approved and units allocated',
      data: verification,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/payment-verifications/{verificationId}/reject')
  async rejectVerification(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['rejectionReason'],
            additionalProperties: false,
            properties: {
              rejectionReason: {type: 'string', minLength: 1},
              status: {type: 'number', enum: [2]},
            },
          },
        },
      },
    })
    body: {rejectionReason: string; status?: number},
  ) {
    const verification =
      await this.spvPaymentVerificationService.rejectVerification(
        verificationId,
        body.rejectionReason,
        currentUser.id,
      );

    return {
      success: true,
      message: 'Verification rejected',
      data: verification,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/payment-verifications/{verificationId}/mark-suspicious')
  async markVerificationSuspicious(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['reason'],
            additionalProperties: false,
            properties: {
              reason: {type: 'string', minLength: 1},
            },
          },
        },
      },
    })
    body: {reason: string},
  ) {
    const verification =
      await this.spvPaymentVerificationService.markSuspicious(
        verificationId,
        body.reason,
        currentUser.id,
      );

    return {
      success: true,
      message: 'Verification flagged as suspicious',
      data: verification,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/payment-verifications/{verificationId}/add-note')
  async addVerificationNote(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['note'],
            additionalProperties: false,
            properties: {
              note: {type: 'string', minLength: 1, maxLength: 1000},
            },
          },
        },
      },
    })
    body: {note: string},
  ) {
    const verification =
      await this.spvPaymentVerificationService.addAdminNote(
        verificationId,
        body.note,
        currentUser.id,
      );

    return {
      success: true,
      message: 'Note added successfully',
      data: verification,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/payment-verifications/{verificationId}/retry-allocation')
  async retryAllocation(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
  ) {
    const verification =
      await this.spvPaymentVerificationService.retryAllocation(
        verificationId,
        currentUser.id,
      );

    return {
      success: true,
      message: 'Allocation retried successfully',
      data: verification,
    };
  }

  // ─── Redemption Payouts ──────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/redemption-payouts')
  async listRedemptionPayouts(
    @param.query.string('spvId') spvId?: string,
    @param.query.string('status') status?: string,
    @param.query.string('investorProfileId') investorProfileId?: string,
    @param.query.string('fromDate') fromDate?: string,
    @param.query.string('toDate') toDate?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('offset') offset?: number,
    @param.query.string('sortBy') sortBy?: string,
    @param.query.string('sortOrder') sortOrder?: string,
  ) {
    const result = await this.redemptionPayoutService.listPayoutsForAdmin({
      spvId,
      status,
      investorProfileId,
      fromDate,
      toDate,
      limit,
      offset,
      sortBy: sortBy as 'createdAt' | 'processedAt' | 'netPayout',
      sortOrder: sortOrder as 'ASC' | 'DESC',
    });

    return {
      success: true,
      message: 'Redemption payouts fetched successfully',
      data: result.data,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/redemption-payouts/{payoutId}')
  async getRedemptionPayoutDetail(
    @param.path.string('payoutId') payoutId: string,
  ) {
    const payout = await this.redemptionPayoutService.getPayoutById(payoutId);

    return {
      success: true,
      message: 'Redemption payout fetched successfully',
      data: payout,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/redemption-payouts/{payoutId}/mark-processing')
  async markPayoutProcessing(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('payoutId') payoutId: string,
  ) {
    const payout = await this.redemptionPayoutService.markProcessing(
      payoutId,
      currentUser.id,
    );

    return {
      success: true,
      message: 'Payout marked as processing',
      data: payout,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/redemption-payouts/{payoutId}/mark-transferred')
  async markPayoutTransferred(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('payoutId') payoutId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['transferReference'],
            additionalProperties: false,
            properties: {
              transferReference: {type: 'string', minLength: 1},
            },
          },
        },
      },
    })
    body: {transferReference: string},
  ) {
    const payout = await this.redemptionPayoutService.updatePayoutStatus(
      payoutId,
      RedemptionPayoutStatus.TRANSFERRED,
      currentUser.id,
      {transferReference: body.transferReference},
    );

    return {
      success: true,
      message: 'Payout marked as transferred',
      data: payout,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/redemption-payouts/{payoutId}/mark-failed')
  async markPayoutFailed(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('payoutId') payoutId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['failureReason'],
            additionalProperties: false,
            properties: {
              failureReason: {type: 'string', minLength: 1},
            },
          },
        },
      },
    })
    body: {failureReason: string},
  ) {
    const payout = await this.redemptionPayoutService.updatePayoutStatus(
      payoutId,
      RedemptionPayoutStatus.FAILED,
      currentUser.id,
      {failureReason: body.failureReason},
    );

    return {
      success: true,
      message: 'Payout marked as failed',
      data: payout,
    };
  }
}
