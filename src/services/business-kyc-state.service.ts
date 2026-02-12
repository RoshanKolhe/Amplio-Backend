import {inject} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';

import {repository} from '@loopback/repository';
import {
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';
import {BusinessKycStatusService} from './businees-kyc-status.service';

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
    /* -------------------- 1️⃣ Verify company -------------------- */
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

    /* -------------------- 2️⃣ Fetch KYC -------------------- */
    const kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    // if (!kyc) {
    //   throw new HttpErrors.NotFound('Business KYC not started');
    // }
    if (!kyc) {
      return {
        businessKycId: null,
        companyProfileId: companyProfile.id,
        completedSteps: [],
        activeStep: null,
      };
    }

    /* -------------------- 3️⃣ Current DB status -------------------- */
    const currentStatus = await this.statusService.fetchApplicationStatusById(
      kyc.businessKycStatusMasterId!,
    );

    /* -------------------- 4️⃣ UI grouping rules -------------------- */
    const AUDITED_STATUSES = [
      'financial_statements',
      'income_tax_returns',
      'gstr_9',
      'gst_3b',
    ];

    /* -------------------- 5️⃣ Completed steps (UI view) -------------------- */
    const completedSteps: Array<{code: string; label: string}> = [];

    // 1️⃣ Business Profile
    if (currentStatus.sequenceOrder > 1) {
      completedSteps.push({
        code: 'business_profile',
        label: 'Business Profile',
      });
    }

    // 2️⃣ Audited Financials (grouped)
    if (currentStatus.sequenceOrder > 5) {
      completedSteps.push({
        code: 'audited_financials',
        label: 'Audited Financials',
      });
    }

    // 3️⃣ Collateral Assets
    if (currentStatus.sequenceOrder > 6) {
      completedSteps.push({
        code: 'collateral_assets',
        label: 'Collateral Assets',
      });
    }

    // 4️⃣ Guarantor Details
    if (currentStatus.sequenceOrder > 7) {
      completedSteps.push({
        code: 'guarantor_details',
        label: 'Guarantor Details',
      });
    }

    // 5️⃣ Review and submit
    if (currentStatus.sequenceOrder > 8) {
      completedSteps.push({
        code: 'review_and_submit',
        label: 'Review and Submit',
      });
    }

    // 6️⃣ Pending
    if (currentStatus.sequenceOrder > 9) {
      completedSteps.push({
        code: 'pending',
        label: 'Pending',
      });
    }

    // 7️⃣ Agreement (FINAL)
    if (currentStatus.sequenceOrder >= 10) {
      completedSteps.push({
        code: 'agreement',
        label: 'Agreement',
      });
    }

    if (currentStatus.sequenceOrder >= 11) {
      completedSteps.push({
        code: 'roc',
        label: 'ROC',
      });
    }

    if (currentStatus.sequenceOrder >= 12) {
      completedSteps.push({
        code: 'dpn',
        label: 'DPN',
      });
    }

    if (currentStatus.sequenceOrder >= 13) {
      completedSteps.push({
        code: 'business_kyc_pending',
        label: 'Business Kyc Pending',
      });
    }

    if (currentStatus.sequenceOrder >= 13) {
      completedSteps.push({
        code: 'business_kyc_pending',
        label: 'Business Kyc Pending',
      });
    }

    /* -------------------- 6️⃣ Active step (UI view) -------------------- */
    let activeStep: {code: string; label: string} | null = null;

    // Any audited sub-status → show single audited step
    if (AUDITED_STATUSES.includes(currentStatus.value)) {
      activeStep = {
        code: 'audited_financials',
        label: 'Audited Financials',
      };
    } else if (currentStatus.value === 'collateral_assets') {
      activeStep = {
        code: 'collateral_assets',
        label: 'Collateral Assets',
      };
    } else if (currentStatus.value === 'guarantor_details') {
      activeStep = {
        code: 'guarantor_details',
        label: 'Guarantor Details',
      };
    } else if (currentStatus.value === 'review_and_submit') {
      activeStep = {
        code: 'review_and_submit',
        label: 'Review and Submit',
      };
    } else if (currentStatus.value === 'pending') {
      activeStep = {
        code: 'pending',
        label: 'Pending',
      };
    } else if (currentStatus.value === 'agreement') {
      activeStep = {
        code: 'agreement',
        label: 'Agreement',
      };
    } else if (currentStatus.value === 'roc') {
      activeStep = {
        code: 'roc',
        label: 'ROC',
      };
    } else if (currentStatus.value === 'dpn') {
      activeStep = {
        code: 'dpn',
        label: 'DPN',
      };
    } else if (currentStatus.value === 'business_kyc_pending') {
      activeStep = {
        code: 'business_kyc_pending',
        label: 'Business KYC Pending',
      };
    } else {
      // fallback (business_profile or any future step)
      activeStep = {
        code: currentStatus.value,
        label: currentStatus.status,
      };
    }

    let currentStage = 'KYC_STEPPER';

    if (currentStatus.value === 'pending') {
      currentStage = 'PENDING';
    }

    if (currentStatus.value === 'agreement') {
      currentStage = 'AGREEMENTS';
    }

    if (currentStatus.value === 'roc') {
      currentStage = 'ROC';
    }

    if (currentStatus.value === 'dpn') {
      currentStage = 'DPN';
    }

    if (currentStatus.value === 'business_kyc_pending') {
      currentStage = 'BUSINESS_KYC_PENDING';
    }

    if (currentStatus.value === 'completed') {
      currentStage = 'COMPLETED';
    }

    /* -------------------- 7️⃣ Final response -------------------- */
    return {
      businessKycId: kyc.id,
      companyProfileId: companyProfile.id,
      completedSteps,
      currentStage,
      isBusinessKycComplete: currentStatus.value === 'completed',
      activeStep,
    };
  }

  async fixBusinessKycStatus(currentUser: UserProfile) {
    // 1. Get company
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

    // 2. Get KYC
    const kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not found');
    }

    // 3. Get FINAL status (review_and_submit)
    const finalStatus =
      await this.statusService.verifyStatusValue('guarantor_details');

    // 4. Update KYC status pointer
    await this.businessKycRepository.updateById(kyc.id, {
      businessKycStatusMasterId: finalStatus.id,
      status: finalStatus.value, // optional but recommended
    });

    return {
      success: true,
      message: 'KYC status synced successfully',
    };
  }
}
