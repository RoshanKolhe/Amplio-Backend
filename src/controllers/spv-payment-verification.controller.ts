import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(value: string, label: string): void {
  if (!value || !UUID_RE.test(value)) {
    throw new HttpErrors.BadRequest(`${label} must be a valid UUID, got: "${value}"`);
  }
}
import {InvestmentOrderService} from '../services/investment-order.service';
import {SpvPaymentVerificationService} from '../services/spv-payment-verification.service';

export class SpvPaymentVerificationController {
  constructor(
    @inject('service.spvPaymentVerification.service')
    private spvPaymentVerificationService: SpvPaymentVerificationService,
    @inject('service.investmentOrder.service')
    private investmentOrderService: InvestmentOrderService,
  ) {}

  // Delegates to InvestmentOrderService so both InvestmentOrder and
  // SpvPaymentVerification are created atomically in a single call.
  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/spv/{spvId}/payment-intent')
  async createPaymentIntent(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['units', 'amount'],
            additionalProperties: false,
            properties: {
              units: {type: 'integer', minimum: 1},
              amount: {type: 'number', minimum: 0.01},
            },
          },
        },
      },
    })
    body: {units: number; amount: number},
  ) {
    const result = await this.investmentOrderService.createOrder(currentUser, {
      spvId,
      requestedUnits: body.units,
      investmentAmount: body.amount,
    });

    return {
      success: true,
      message: 'Payment intent created successfully',
      data: {
        orderId: result.order.id,
        verificationId: result.verificationId,
        referenceId: result.referenceId,
        paymentDeadlineAt: result.paymentDeadlineAt,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/spv/payment-verifications/{verificationId}/submit-utr')
  async submitUtr(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['utrNumber'],
            additionalProperties: false,
            properties: {
              utrNumber: {type: 'string', minLength: 1, maxLength: 64},
              screenshotUrl: {type: 'string'},
            },
          },
        },
      },
    })
    body: {utrNumber: string; screenshotUrl?: string},
  ) {
    assertUuid(verificationId, 'verificationId');
    const verification = await this.spvPaymentVerificationService.submitUtr(
      currentUser,
      verificationId,
      body.utrNumber,
      body.screenshotUrl,
    );

    return {
      success: true,
      message: 'UTR submitted successfully',
      data: verification,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/spv/payment-verifications/{verificationId}/expire')
  async expireVerification(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
  ) {
    assertUuid(verificationId, 'verificationId');
    const investorProfileId = await this.spvPaymentVerificationService['resolveInvestorProfileId'](currentUser.id);
    const verification = await this.spvPaymentVerificationService.expireVerification(
      verificationId,
      investorProfileId,
    );

    return {
      success: true,
      message: 'Verification expired due to timeout',
      data: verification,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/spv/payment-verifications')
  async getMyVerifications(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('spvId') spvId?: string,
  ) {
    const verifications =
      await this.spvPaymentVerificationService.getInvestorVerifications(
        currentUser,
        spvId,
      );

    return {
      success: true,
      message: 'Verifications fetched successfully',
      data: verifications,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/spv/{spvId}/payment-instructions')
  async getPaymentInstructions(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
  ) {
    const instructions =
      await this.spvPaymentVerificationService.getPaymentInstructions(
        spvId,
        currentUser,
      );

    return {
      success: true,
      message: 'Payment instructions fetched successfully',
      data: instructions,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/spv/payment-verifications/{verificationId}/flow-state')
  async getFlowState(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('verificationId') verificationId: string,
  ) {
    assertUuid(verificationId, 'verificationId');
    const flowState = await this.spvPaymentVerificationService.getFlowState(
      verificationId,
      currentUser,
    );

    return {
      success: true,
      message: 'Flow state fetched successfully',
      data: flowState,
    };
  }
}
