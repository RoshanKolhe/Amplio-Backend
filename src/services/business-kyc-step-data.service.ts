import {inject} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';

import {
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';

import {BusinessKycStatusService} from './businees-kyc-status.service';
import {BusinessKycStatusDataService} from './business-kyc-status-data.service';
import {repository} from '@loopback/repository';

export class BusinessKycStepDataService {
  constructor(
    @repository(CompanyProfilesRepository)
    private companyProfileRepository: CompanyProfilesRepository,

    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @inject('services.BusinessKycStatusService')
    private statusService: BusinessKycStatusService,

    @inject('services.BusinessKycStatusDataService')
    private statusDataService: BusinessKycStatusDataService,
  ) {}

  async fetchStepDataByStatus(currentUser: UserProfile, statusValue: string) {
    /* 1️⃣ Resolve company from token */
    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        usersId: currentUser.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    /* 2️⃣ Resolve active KYC */
    const kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not started');
    }

    /* 3️⃣ Current status */
    const currentStatus = await this.statusService.fetchApplicationStatusById(
      kyc.businessKycStatusMasterId!,
    );

    /* 4️⃣ Requested status validation */
    const requestedStatus =
      await this.statusService.verifyStatusValue(statusValue);

    /* 5️⃣ Step lock */
    if (requestedStatus.sequenceOrder > currentStatus.sequenceOrder) {
      throw new HttpErrors.BadRequest('This step is not completed yet');
    }

    /* 6️⃣ Fetch page-specific data */
    const stepData = await this.statusDataService.fetchDataWithStatus(
      kyc.id!,
      requestedStatus.value,
    );

    return {
      businessKycId: kyc.id,
      step: {
        id: requestedStatus.id,
        label: requestedStatus.status,
        code: requestedStatus.value,
      },
      data: stepData,
    };
  }
}
