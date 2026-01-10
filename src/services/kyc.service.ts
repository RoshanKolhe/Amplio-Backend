import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {CompanyPanCardsRepository, CompanyProfilesRepository, InvestorPanCardsRepository, InvestorProfileRepository, KycApplicationsRepository, TrusteePanCardsRepository, TrusteeProfilesRepository} from '../repositories';

export class KycService {
  constructor(
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @repository(CompanyProfilesRepository)
    private companyProfilesRepository: CompanyProfilesRepository,
    @repository(CompanyPanCardsRepository)
    private companyPanCardsRepository: CompanyPanCardsRepository,
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(TrusteePanCardsRepository)
    private trusteePanCardsRepository: TrusteePanCardsRepository,
    @repository(InvestorPanCardsRepository)
    private investorPanCardsRepository: InvestorPanCardsRepository,
  ) { }

  async handleCompanyKycApplication(
    applicationId: string,
    companyId: string,
    status: number,
    reason: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any
  ) {
    try {
      const companyPanCard = await this.companyPanCardsRepository.findOne(
        {
          where: {companyProfilesId: companyId},
          order: ['createdAt DESC']
        }
      );

      if (!companyPanCard || !companyPanCard.id) {
        throw new HttpErrors.NotFound('Unable to fetch pan card details');
      }

      // update kyc application
      await this.kycApplicationsRepository.updateById(
        applicationId,
        {status, verifiedAt: new Date()},
        {transaction: tx}
      );

      // APPROVED
      if (status === 2) {
        await this.companyProfilesRepository.updateById(
          companyId,
          {isActive: true},
          {transaction: tx}
        );

        await this.companyPanCardsRepository.updateById(companyPanCard?.id, {status: 1, verifiedAt: new Date()})

        return {
          success: true,
          message: 'Company KYC approved successfully',
          kycStatus: 2
        };
      }

      // REJECTED
      if (status === 3) {
        await this.companyProfilesRepository.updateById(
          companyId,
          {isActive: false},
          {transaction: tx}
        );

        await this.companyPanCardsRepository.updateById(companyPanCard?.id, {status: 2, reason: reason})

        return {
          success: true,
          message: 'Company KYC rejected',
          kycStatus: 3
        };
      }

      throw new HttpErrors.BadRequest('Invalid status value');

    } catch (error) {
      console.log('error in handle Company Kyc Application:', error);
      throw error;
    }
  }

  async handleTrusteeKycApplication(
    applicationId: string,
    trusteeId: string,
    status: number,
    reason: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any
  ) {
    try {
      const trusteePanCard = await this.trusteePanCardsRepository.findOne(
        {
          where: {trusteeProfilesId: trusteeId},
          order: ['createdAt DESC']
        }
      );

      if (!trusteePanCard || !trusteePanCard.id) {
        throw new HttpErrors.NotFound('Unable to fetch pan card details');
      }

      // update kyc application
      await this.kycApplicationsRepository.updateById(
        applicationId,
        {status, verifiedAt: new Date()},
        {transaction: tx}
      );

      // APPROVED
      if (status === 2) {
        await this.trusteeProfilesRepository.updateById(
          trusteeId,
          {isActive: true},
          {transaction: tx}
        );

        await this.trusteePanCardsRepository.updateById(trusteePanCard?.id, {status: 1, verifiedAt: new Date()})

        return {
          success: true,
          message: 'Trustee KYC approved successfully',
          kycStatus: 2
        };
      }

      // REJECTED
      if (status === 3) {
        await this.trusteeProfilesRepository.updateById(
          trusteeId,
          {isActive: false},
          {transaction: tx}
        );

        await this.trusteePanCardsRepository.updateById(trusteePanCard?.id, {status: 2, reason: reason})

        return {
          success: true,
          message: 'Trustee KYC rejected',
          kycStatus: 3
        };
      }

      throw new HttpErrors.BadRequest('Invalid status value');

    } catch (error) {
      console.log('error in handle Trustee Kyc Application:', error);
      throw error;
    }
  }

  async handleInvestorKycApplication(
    applicationId: string,
    investorId: string,
    status: number,
    reason: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any
  ) {
    try {
      const investorPanCard = await this.investorPanCardsRepository.findOne(
        {
          where: {investorProfileId: investorId},
          order: ['createdAt DESC']
        }
      );

      if (!investorPanCard || !investorPanCard.id) {
        throw new HttpErrors.NotFound('Unable to fetch pan card details');
      }

      // update kyc application
      await this.kycApplicationsRepository.updateById(
        applicationId,
        {status, verifiedAt: new Date()},
        {transaction: tx}
      );

      // APPROVED
      if (status === 2) {
        await this.investorProfileRepository.updateById(
          investorId,
          {isActive: true},
          {transaction: tx}
        );

        await this.investorPanCardsRepository.updateById(investorPanCard?.id, {status: 1, verifiedAt: new Date()})

        return {
          success: true,
          message: 'Investor KYC approved successfully',
          kycStatus: 2
        };
      }

      // REJECTED
      if (status === 3) {
        await this.investorProfileRepository.updateById(
          investorId,
          {isActive: false},
          {transaction: tx}
        );

        await this.investorPanCardsRepository.updateById(investorPanCard?.id, {status: 2, reason: reason})

        return {
          success: true,
          message: 'Investor KYC rejected',
          kycStatus: 3
        };
      }

      throw new HttpErrors.BadRequest('Invalid status value');

    } catch (error) {
      console.log('error in handle Investor Kyc Application:', error);
      throw error;
    }
  }

  // filter kyc applications based on status and role
  async handleKycApplicationFilter(status: number, roleValue: string): Promise<{success: boolean; message: string; profileIds: string[]}> {
    const kycApplications = await this.kycApplicationsRepository.find({
      where: {
        and: [
          {status},
          {roleValue},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      fields: {identifierId: true, roleValue: true}
    });

    if (kycApplications.length > 0) {
      const profileIds = kycApplications.map((application) => application.identifierId) || [];

      return {
        success: true,
        message: 'Filtered status based profiles',
        profileIds
      }
    }

    return {
      success: true,
      message: 'Filtered status based profiles',
      profileIds: []
    }
  }
}
