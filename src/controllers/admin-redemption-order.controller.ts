import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param} from '@loopback/rest';
import {authorize} from '../authorization';
import {RedemptionPayoutService} from '../services/redemption-payout.service';

export class AdminRedemptionOrderController {
  constructor(
    @inject('service.redemptionPayout.service')
    private redemptionPayoutService: RedemptionPayoutService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin', 'trustee']})
  @get('/admin/redemption-orders')
  async listRedemptionOrders(
    @param.query.string('spvId') spvId?: string,
    @param.query.string('investorProfileId') investorProfileId?: string,
    @param.query.string('status') status?: string,
    @param.query.string('fromDate') fromDate?: string,
    @param.query.string('toDate') toDate?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('offset') offset?: number,
    @param.query.string('sortBy') sortBy?: 'createdAt' | 'processedAt' | 'netPayout' | 'expectedPayoutDate',
    @param.query.string('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    const result = await this.redemptionPayoutService.listPayoutsForAdmin({
      spvId,
      investorProfileId,
      status,
      fromDate,
      toDate,
      limit,
      offset,
      sortBy,
      sortOrder,
    });

    // Flatten investorProfile into top-level fields for consistency with investment orders API
    const data = result.data.map((payout: any) => ({
      ...payout,
      investorName: payout.investorProfile?.fullName ?? null,
      investorEmail: payout.investorProfile?.email ?? null,
    }));

    return {
      success: true,
      message: 'Redemption orders fetched successfully',
      data,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin', 'trustee']})
  @get('/admin/redemption-orders/{payoutId}')
  async getRedemptionOrderDetail(
    @param.path.string('payoutId') payoutId: string,
  ) {
    const payout: any = await this.redemptionPayoutService.getPayoutById(payoutId);

    return {
      success: true,
      message: 'Redemption order detail fetched successfully',
      data: {
        ...payout,
        investorName: payout.investorProfile?.fullName ?? null,
        investorEmail: payout.investorProfile?.email ?? null,
      },
    };
  }
}
