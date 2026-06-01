import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, patch, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {CustomerSupportStatus, EscalationStatus} from '../models';
import {
  AdminInvestmentOrderService,
  UpdateAdminCustomerSupportDto,
} from '../services/admin-investment-order.service';

export class AdminInvestmentOrderController {
  constructor(
    @inject('service.adminInvestmentOrder.service')
    private adminInvestmentOrderService: AdminInvestmentOrderService,
  ) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/investment-orders/stats')
  async getDashboardStats(
    @param.query.string('spvId') spvId?: string,
  ) {
    const stats = await this.adminInvestmentOrderService.getDashboardStats(spvId);

    return {
      success: true,
      message: 'Dashboard stats fetched successfully',
      data: stats,
    };
  }

  // ── Order monitoring ──────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin', 'trustee']})
  @get('/admin/investment-orders')
  async listOrders(
    @param.query.string('spvId') spvId?: string,
    @param.query.string('investorProfileId') investorProfileId?: string,
    @param.query.string('status') status?: string,
    @param.query.string('fromDate') fromDate?: string,
    @param.query.string('toDate') toDate?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('offset') offset?: number,
  ) {
    const result = await this.adminInvestmentOrderService.listOrders({
      spvId,
      investorProfileId,
      status,
      fromDate,
      toDate,
      limit,
      offset,
    });

    return {
      success: true,
      message: 'Investment orders fetched successfully',
      data: result.data,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin', 'trustee']})
  @get('/admin/investment-orders/{orderId}')
  async getOrderDetail(
    @param.path.string('orderId') orderId: string,
  ) {
    const detail = await this.adminInvestmentOrderService.getOrderDetail(orderId);

    return {
      success: true,
      message: 'Order detail fetched successfully',
      data: detail,
    };
  }

  // ── Order actions ─────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/investment-orders/{orderId}/force-expire')
  async forceExpireOrder(
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
    const order = await this.adminInvestmentOrderService.forceExpireOrder(
      orderId,
      currentUser.id,
      body?.reason,
    );

    return {
      success: true,
      message: 'Order force-expired successfully',
      data: order,
    };
  }

  // ── Escalation monitoring ─────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/escalations')
  async listEscalations(
    @param.query.string('spvId') spvId?: string,
    @param.query.string('investorProfileId') investorProfileId?: string,
    @param.query.string('status') status?: string,
    @param.query.string('escalationType') escalationType?: string,
    @param.query.string('fromDate') fromDate?: string,
    @param.query.string('toDate') toDate?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('offset') offset?: number,
  ) {
    const result = await this.adminInvestmentOrderService.listEscalations({
      spvId,
      investorProfileId,
      status,
      escalationType,
      fromDate,
      toDate,
      limit,
      offset,
    });

    return {
      success: true,
      message: 'Escalations fetched successfully',
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
  @get('/admin/customer-support')
  async listCustomerSupport(
    @param.query.string('spvId') spvId?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('offset') offset?: number,
  ) {
    const result = await this.adminInvestmentOrderService.listCustomerSupport({
      spvId,
      limit,
      offset,
    });

    return {
      success: true,
      message: 'Customer support requests fetched successfully',
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
  @get('/admin/rejected-orders')
  async listRejectedOrders(
    @param.query.string('spvId') spvId?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('offset') offset?: number,
  ) {
    const result = await this.adminInvestmentOrderService.listRejectedOrders({
      spvId,
      limit,
      offset,
    });

    return {
      success: true,
      message: 'Rejected orders fetched successfully',
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
  @patch('/admin/customer-support/{supportId}')
  async updateCustomerSupport(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('supportId') supportId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: {
                type: 'string',
                enum: Object.values(CustomerSupportStatus),
              },
              adminResponse: {type: 'string', maxLength: 2000},
              assignSuperAdmin: {type: 'boolean'},
            },
          },
        },
      },
    })
    body: UpdateAdminCustomerSupportDto,
  ) {
    const support = await this.adminInvestmentOrderService.updateCustomerSupport(
      supportId,
      currentUser.id,
      body,
    );

    return {
      success: true,
      message: 'Customer support request updated successfully',
      data: support,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/escalations/{escalationId}')
  async getEscalationDetail(
    @param.path.string('escalationId') escalationId: string,
  ) {
    const escalation =
      await this.adminInvestmentOrderService.getEscalationDetail(escalationId);

    return {
      success: true,
      message: 'Escalation fetched successfully',
      data: escalation,
    };
  }

  // ── Escalation actions ────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @post('/admin/escalations/{escalationId}/update-status')
  async updateEscalationStatus(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('escalationId') escalationId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status'],
            additionalProperties: false,
            properties: {
              status: {
                type: 'string',
                enum: Object.values(EscalationStatus),
              },
              resolution: {type: 'string', minLength: 5, maxLength: 2000},
            },
          },
        },
      },
    })
    body: {status: EscalationStatus; resolution?: string},
  ) {
    const escalation =
      await this.adminInvestmentOrderService.updateEscalationStatus(
        escalationId,
        body.status,
        currentUser.id,
        body.resolution,
      );

    return {
      success: true,
      message: 'Escalation updated successfully',
      data: escalation,
    };
  }

  // ── Pool cutoff window settings ───────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/pools/{spvId}/cutoff-settings')
  async getPoolCutoffSettings(
    @param.path.string('spvId') spvId: string,
  ) {
    const settings = await this.adminInvestmentOrderService.getPoolCutoffSettings(spvId);

    return {
      success: true,
      message: 'Pool cutoff settings fetched successfully',
      data: settings,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/admin/pools/{spvId}/cutoff-settings')
  async updatePoolCutoffSettings(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              enforceCutoffWindow: {type: 'boolean'},
              morningCutoffTime: {
                type: 'string',
                pattern: '^\\d{2}:\\d{2}(:\\d{2})?$',
                description: 'e.g. "09:00" or "09:00:00"',
              },
              eveningCutoffTime: {
                type: 'string',
                pattern: '^\\d{2}:\\d{2}(:\\d{2})?$',
                description: 'e.g. "15:00" or "15:00:00"',
              },
            },
          },
        },
      },
    })
    body: {
      enforceCutoffWindow?: boolean;
      morningCutoffTime?: string;
      eveningCutoffTime?: string;
    },
  ) {
    const settings = await this.adminInvestmentOrderService.updatePoolCutoffSettings(
      spvId,
      body,
      currentUser.id,
    );

    return {
      success: true,
      message: 'Pool cutoff settings updated successfully',
      data: settings,
    };
  }
}
