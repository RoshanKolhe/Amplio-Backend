import {
  authenticate,
  AuthenticationBindings,
} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {
  InvestorClosedInvestmentRecord,
  InvestorInvestmentRecord,
  InvestorInvestmentsService,
  InvestorPortfolioData,
  InvestorPortfolioTransactionRecord,
} from '../services/investor-investments.service';

interface BuyInvestorInvestmentRequest {
  units: number;
  allowPartialAllocation?: boolean;
  idempotencyKey?: string;
}

export class InvestorInvestmentsController {
  constructor(
    @inject('service.investorInvestments.service')
    private investorInvestmentsService: InvestorInvestmentsService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor-data')
  async getInvestorInvestments(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<InvestorInvestmentRecord[]> {
    return this.investorInvestmentsService.listInvestorInvestments(currentUser);
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor-data/{id}')
  async getInvestorInvestmentById(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('id') id: string,
  ): Promise<InvestorInvestmentRecord> {
    return this.investorInvestmentsService.getInvestorInvestmentById(
      currentUser,
      id,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/portfolio-data')
  async getPortfolioData(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('tab') tab?: 'active' | 'closed',
  ): Promise<InvestorPortfolioData> {
    return this.investorInvestmentsService.getInvestorPortfolioData(
      currentUser,
      tab,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/dashboard/portfolio')
  async getDashboardPortfolio(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('tab') tab?: 'active' | 'closed',
  ): Promise<InvestorPortfolioData> {
    return this.investorInvestmentsService.getInvestorPortfolioData(
      currentUser,
      tab,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/dashboard/portfolio/ptc-transactions')
  async getPortfolioPtcTransactions(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('spvId') spvId?: string,
    @param.query.string('tab') tab?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('skip') skip?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: InvestorPortfolioTransactionRecord[];
    count: {
      totalCount: number;
    };
  }> {
    const result =
      await this.investorInvestmentsService.listInvestorPortfolioOnlineTransactions(
        currentUser,
        {spvId, tab, limit, skip},
      );

    return {
      success: true,
      message: 'PTC transactions',
      data: result.data,
      count: {
        totalCount: result.totalCount,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/dashboard/portfolio/online-transactions')
  async getPortfolioOnlineTransactions(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('spvId') spvId?: string,
    @param.query.string('tab') tab?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('skip') skip?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: InvestorPortfolioTransactionRecord[];
    count: {
      totalCount: number;
    };
  }> {
    const result =
      await this.investorInvestmentsService.listInvestorPortfolioOnlineTransactions(
        currentUser,
        {spvId, tab, limit, skip},
      );

    return {
      success: true,
      message: 'Portfolio transactions',
      data: result.data,
      count: {
        totalCount: result.totalCount,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/portfolio-data/closed-investments')
  async getClosedInvestments(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('spvId') spvId?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('skip') skip?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: InvestorClosedInvestmentRecord[];
    count: {
      totalCount: number;
    };
    limit: number;
    skip: number;
  }> {
    const result = await this.investorInvestmentsService.listInvestorClosedInvestments(
      currentUser,
      {spvId, limit, skip},
    );

    return {
      success: true,
      message: 'Closed investments',
      data: result.data,
      count: {
        totalCount: result.totalCount,
      },
      limit: result.limit,
      skip: result.skip,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/dashboard/portfolio/closed-investments')
  async getDashboardClosedInvestments(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.query.string('spvId') spvId?: string,
    @param.query.number('limit') limit?: number,
    @param.query.number('skip') skip?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: InvestorClosedInvestmentRecord[];
    count: {
      totalCount: number;
    };
    limit: number;
    skip: number;
  }> {
    return this.getClosedInvestments(currentUser, spvId, limit, skip);
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investor-data/{id}/buy')
  async buyInvestorInvestment(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('id') id: string,
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
    body: BuyInvestorInvestmentRequest,
  ) {
    const allocation = await this.investorInvestmentsService.buyInvestorInvestment(
      currentUser,
      id,
      body.units,
      {
        allowPartialAllocation: body.allowPartialAllocation,
        idempotencyKey: body.idempotencyKey,
      },
    );

    return {
      success: true,
      message: allocation.partialAllocation
        ? 'Investment partially allocated based on available units'
        : 'Investment allocated successfully',
      allocation,
    };
  }
}
