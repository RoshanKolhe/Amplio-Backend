import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {EscalationType} from '../models';
import {
  EscalateOrderDto,
  InvestmentOrderService,
} from '../services/investment-order.service';

export class InvestmentOrderController {
  constructor(
    @inject('service.investmentOrder.service')
    private investmentOrderService: InvestmentOrderService,
  ) {}

  // ── Create order ─────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investments/orders')
  async createOrder(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['spvId', 'requestedUnits', 'investmentAmount'],
            additionalProperties: false,
            properties: {
              spvId: {type: 'string', format: 'uuid'},
              requestedUnits: {type: 'integer', minimum: 1},
              investmentAmount: {type: 'number', minimum: 0.01},
              faceValuePerUnit: {type: 'number', minimum: 0.01},
              idempotencyKey: {type: 'string', minLength: 8, maxLength: 80},
            },
          },
        },
      },
    })
    body: {
      spvId: string;
      requestedUnits: number;
      investmentAmount: number;
      faceValuePerUnit?: number;
      idempotencyKey?: string;
    },
  ) {
    const result = await this.investmentOrderService.createOrder(
      currentUser,
      body,
    );

    return {
      success: true,
      message: 'Investment order created successfully',
      data: result,
    };
  }

  // ── Submit UTR ───────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investments/orders/{orderId}/submit-utr')
  async submitUtr(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
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
    const order = await this.investmentOrderService.submitUtr(
      currentUser,
      orderId,
      body.utrNumber,
      body.screenshotUrl,
    );

    return {
      success: true,
      message: 'UTR submitted successfully',
      data: order,
    };
  }

  // ── Cancel order ─────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investments/orders/{orderId}/cancel')
  async cancelOrder(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
    @requestBody({
      required: false,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reason: {type: 'string', maxLength: 500},
            },
          },
        },
      },
    })
    body?: {reason?: string},
  ) {
    const order = await this.investmentOrderService.cancelOrder(
      currentUser,
      orderId,
      body?.reason,
    );

    return {
      success: true,
      message: 'Order cancelled successfully',
      data: order,
    };
  }

  // ── Escalate ─────────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investments/orders/{orderId}/escalate')
  async escalateOrder(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['reason', 'description'],
            additionalProperties: false,
            properties: {
              escalationType: {
                type: 'string',
                enum: Object.values(EscalationType),
              },
              reason: {type: 'string', minLength: 3, maxLength: 200},
              description: {type: 'string', minLength: 10, maxLength: 2000},
              attachmentUrl: {type: 'string'},
            },
          },
        },
      },
    })
    body: EscalateOrderDto,
  ) {
    const escalation = await this.investmentOrderService.escalateOrder(
      currentUser,
      orderId,
      body,
    );

    return {
      success: true,
      message: 'Escalation filed successfully',
      data: escalation,
    };
  }

  // ── Read endpoints ────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investments/orders')
  async listOrders(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('spvId') spvId?: string,
  ) {
    const orders = await this.investmentOrderService.getInvestorOrders(
      currentUser,
      spvId,
    );

    return {
      success: true,
      message: 'Orders fetched successfully',
      data: orders,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investments/orders/{orderId}')
  async getOrder(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
  ) {
    const order = await this.investmentOrderService.getOrder(currentUser, orderId);

    return {
      success: true,
      message: 'Order fetched successfully',
      data: order,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investments/orders/{orderId}/flow-state')
  async getFlowState(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
  ) {
    const flowState = await this.investmentOrderService.getFlowState(
      currentUser,
      orderId,
    );

    return {
      success: true,
      message: 'Flow state fetched successfully',
      data: flowState,
    };
  }
}
