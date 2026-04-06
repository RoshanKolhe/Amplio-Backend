import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {InvestmentMandate} from '../models';
import {InvestmentMandateRepository} from '../repositories';

export class InvestmentMandateService {
  constructor(
    @repository(InvestmentMandateRepository)
    private investmentMandateRepository: InvestmentMandateRepository,
  ) {}

  async createOrUpdateInvestmentMandate(
    mandateData: Partial<InvestmentMandate>,
  ): Promise<{
    success: boolean;
    message: string;
    investmentMandate: InvestmentMandate;
  }> {
    if (!mandateData.usersId || !mandateData.identifierId || !mandateData.roleValue) {
      throw new HttpErrors.BadRequest(
        'usersId, identifierId and roleValue are required',
      );
    }

    const existingInvestmentMandate =
      await this.investmentMandateRepository.findOne({
        where: {
          and: [
            {usersId: mandateData.usersId},
            {identifierId: mandateData.identifierId},
            {roleValue: mandateData.roleValue},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (existingInvestmentMandate?.status === 1) {
      throw new HttpErrors.BadRequest(
        'Investment mandate is already approved and cannot be modified',
      );
    }

    if (existingInvestmentMandate) {
      await this.investmentMandateRepository.updateById(
        existingInvestmentMandate.id,
        {
          ...mandateData,
          status: 0,
          mode: 1,
          reason: undefined,
          verifiedAt: undefined,
        },
      );

      const updatedInvestmentMandate =
        await this.investmentMandateRepository.findById(
          existingInvestmentMandate.id,
        );

      return {
        success: true,
        message: 'Investment mandate updated successfully',
        investmentMandate: updatedInvestmentMandate,
      };
    }

    const investmentMandate = await this.investmentMandateRepository.create({
      ...mandateData,
      status: mandateData.status ?? 0,
      mode: mandateData.mode ?? 1,
      isActive: mandateData.isActive ?? true,
      isDeleted: mandateData.isDeleted ?? false,
    });

    return {
      success: true,
      message: 'Investment mandate saved successfully',
      investmentMandate,
    };
  }

  async fetchUserInvestmentMandate(
    usersId: string,
    roleValue: string,
    identifierId: string,
  ): Promise<{
    success: boolean;
    message: string;
    investmentMandate: InvestmentMandate | null;
  }> {
    const investmentMandate = await this.investmentMandateRepository.findOne({
      where: {
        and: [
          {usersId},
          {roleValue},
          {identifierId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    return {
      success: true,
      message: 'Investment mandate',
      investmentMandate,
    };
  }
}
