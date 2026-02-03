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

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not started');
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
    } else {
      // fallback (business_profile or any future step)
      activeStep = {
        code: currentStatus.value,
        label: currentStatus.status,
      };
    }

    /* -------------------- 7️⃣ Final response -------------------- */
    return {
      businessKycId: kyc.id,
      companyProfileId: companyProfile.id,
      completedSteps,
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
