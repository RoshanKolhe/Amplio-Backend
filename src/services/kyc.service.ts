import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {
  AddressDetailsRepository,
  AuthorizeSignatoriesRepository,
  BankDetailsRepository,
  CompanyKycDocumentRepository,
  CompanyPanCardsRepository,
  CompanyProfilesRepository,
  InvestorPanCardsRepository,
  InvestorProfileRepository,
  KycApplicationsRepository,
  TrusteePanCardsRepository,
  TrusteeProfilesRepository,
} from '../repositories';
import {CompanyKycDocumentRequirementsService} from './company-kyc-document-requirements.service';

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
    @repository(CompanyKycDocumentRepository)
    private companyKycDocumentRepository: CompanyKycDocumentRepository,
    @repository(AddressDetailsRepository)
    private addressDetailsRepository: AddressDetailsRepository,
    @repository(BankDetailsRepository)
    private bankDetailsRepository: BankDetailsRepository,
    @repository(AuthorizeSignatoriesRepository)
    private authorizeSignatoriesRepository: AuthorizeSignatoriesRepository,
    @inject('service.companyKycDocumentRequirementsService.service')
    private companyKycDocumentRequirementsService: CompanyKycDocumentRequirementsService,
  ) { }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async ensureCompanySectionsApproved(companyId: string, tx: any): Promise<void> {
    const companyProfile = await this.companyProfilesRepository.findOne(
      {
        where: {
          and: [{id: companyId}, {isDeleted: false}],
        },
      },
      {transaction: tx},
    );

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    const notApprovedSections: string[] = [];

    try {
      const requiredDocuments =
        await this.companyKycDocumentRequirementsService.fetchRequiredDocuments(
          companyProfile.usersId,
        );

      if (!requiredDocuments.length) {
        notApprovedSections.push('documents');
      } else {
        const uploadedDocuments = await this.companyKycDocumentRepository.find(
          {
            where: {
              and: [
                {usersId: companyProfile.usersId},
                {
                  companyKycDocumentRequirementsId: {
                    inq: requiredDocuments.map(doc => doc.id),
                  },
                },
                {isActive: true},
                {isDeleted: false},
              ],
            },
            order: ['createdAt DESC'],
          },
          {transaction: tx},
        );

        const latestStatusByRequirementId = new Map<string, number>();
        for (const document of uploadedDocuments) {
          if (
            !latestStatusByRequirementId.has(
              document.companyKycDocumentRequirementsId,
            )
          ) {
            latestStatusByRequirementId.set(
              document.companyKycDocumentRequirementsId,
              document.status,
            );
          }
        }

        const hasPendingOrRejectedRequiredDocument = requiredDocuments.some(
          requiredDocument =>
            latestStatusByRequirementId.get(requiredDocument.id) !== 1,
        );

        if (hasPendingOrRejectedRequiredDocument) {
          notApprovedSections.push('documents');
        }
      }
    } catch {
      notApprovedSections.push('documents');
    }

    try {
      const addressDetails = await this.addressDetailsRepository.find(
        {
          where: {
            and: [
              {roleValue: 'company'},
              {identifierId: companyId},
              {isActive: true},
              {isDeleted: false},
            ],
          },
        },
        {transaction: tx},
      );

      if (
        !addressDetails.length ||
        addressDetails.some(address => address.status !== 1)
      ) {
        notApprovedSections.push('address');
      }
    } catch {
      notApprovedSections.push('address');
    }

    try {
      const bankDetails = await this.bankDetailsRepository.find(
        {
          where: {
            and: [
              {usersId: companyProfile.usersId},
              {roleValue: 'company'},
              {isActive: true},
              {isDeleted: false},
            ],
          },
        },
        {transaction: tx},
      );

      if (!bankDetails.length || bankDetails.some(bank => bank.status !== 1)) {
        notApprovedSections.push('bank details');
      }
    } catch {
      notApprovedSections.push('bank details');
    }

    try {
      const signatories = await this.authorizeSignatoriesRepository.find(
        {
          where: {
            and: [
              {identifierId: companyId},
              {roleValue: 'company'},
              {isActive: true},
              {isDeleted: false},
            ],
          },
        },
        {transaction: tx},
      );

      if (
        !signatories.length ||
        signatories.some(signatory => signatory.status !== 1)
      ) {
        notApprovedSections.push('signatories');
      }
    } catch {
      notApprovedSections.push('signatories');
    }

    if (notApprovedSections.length) {
      throw new HttpErrors.BadRequest(
        `Cannot approve company profile. These KYC sections are not approved: ${notApprovedSections.join(', ')}`,
      );
    }
  }

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

      if (status === 2) {
        await this.ensureCompanySectionsApproved(companyId, tx);
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
