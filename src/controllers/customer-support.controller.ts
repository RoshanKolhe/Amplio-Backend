import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {
  CreateCustomerSupportDto,
  CustomerSupportService,
} from '../services/customer-support.service';

export class CustomerSupportController {
  constructor(
    @inject('service.customerSupport.service')
    private customerSupportService: CustomerSupportService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investments/orders/{orderId}/customer-support')
  async createSupportRequest(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['issueType', 'complaintDescription'],
            additionalProperties: false,
            properties: {
              issueType: {type: 'string', minLength: 1, maxLength: 255},
              complaintDescription: {
                type: 'string',
                minLength: 1,
                maxLength: 2000,
              },
              attachmentMediaId: {type: 'string', format: 'uuid'},
            },
          },
        },
      },
    })
    body: CreateCustomerSupportDto,
  ) {
    const support = await this.customerSupportService.createSupportRequest(
      currentUser,
      orderId,
      body,
    );

    return {
      success: true,
      message: 'Support request created successfully',
      data: support,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investments/orders/{orderId}/customer-support')
  async listSupportRequests(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
  ) {
    const supportRequests = await this.customerSupportService.getOrderSupportRequests(
      currentUser,
      orderId,
    );

    return {
      success: true,
      message: 'Support requests fetched successfully',
      data: supportRequests,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investments/orders/{orderId}/customer-support/{supportId}')
  async getSupportRequestById(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('orderId') orderId: string,
    @param.path.string('supportId') supportId: string,
  ) {
    const support = await this.customerSupportService.getSupportRequestById(
      currentUser,
      orderId,
      supportId,
    );

    return {
      success: true,
      message: 'Support request fetched successfully',
      data: support,
    };
  }
}
