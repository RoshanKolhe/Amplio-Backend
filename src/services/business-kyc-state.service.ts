import {inject} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';

import {
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';
import {BusinessKycStatusService} from './businees-kyc-status.service';
import {repository} from '@loopback/repository';

export class BusinessKycStateService {
  constructor(
    @repository(CompanyProfilesRepository)
    private companyProfileRepository: CompanyProfilesRepository,

    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @inject('services.BusinessKycStatusService')
    private statusService: BusinessKycStatusService,
  ) {}

  async fetchStateByUser(currentUser: UserProfile) {
    // 1️⃣ Verify company
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

    // 2️⃣ Fetch KYC
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

    // 3️⃣ Fetch status
    const currentStatus = await this.statusService.fetchApplicationStatusById(
      kyc.businessKycStatusMasterId!,
    );

    const completedSteps = await this.statusService.fetchCompletedStepsSequence(
      currentStatus.sequenceOrder,
    );

    // 4️⃣ Return clean DTO
    return {
      businessKycId: kyc.id,
      companyProfileId: companyProfile.id,
      completedSteps,
      activeStep: {
        id: currentStatus.id,
        label: currentStatus.status,
        code: currentStatus.value,
      },
    };
  }
}


