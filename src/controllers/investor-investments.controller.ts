import {
  authenticate,
  AuthenticationBindings,
} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {
  InvestorInvestmentRecord,
  InvestorInvestmentsService,
  InvestorPortfolioData,
} from '../services/investor-investments.service';

export class InvestorInvestmentsController {
  constructor(
    @inject('service.investorInvestments.service')
    private investorInvestmentsService: InvestorInvestmentsService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor_data')
  async getInvestorInvestments(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<InvestorInvestmentRecord[]> {
    return this.investorInvestmentsService.listInvestorInvestments(currentUser);
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor_data/{id}')
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
  ): Promise<InvestorPortfolioData> {
    return this.investorInvestmentsService.getInvestorPortfolioData(currentUser);
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investor_data/{id}/buy')
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
            properties: {
              units: {type: 'number'},
            },
          },
        },
      },
    })
    body: {units: number},
  ) {
    const allocation = await this.investorInvestmentsService.buyInvestorInvestment(
      currentUser,
      id,
      body.units,
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
