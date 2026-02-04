import {inject} from '@loopback/core';
import {IsolationLevel, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';

import {
  BusinessKycAuditedFinancials,
  BusinessKycCollateralAssets,
  BusinessKycGuarantor,
} from '../models';

import {
  BusinessKycGuarantorRepository,
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';

import {BusinessKycStatusService} from './businees-kyc-status.service';
import {BusinessKycAuditedFinancialsService} from './business-kyc-audited-financials.service';
import {BusinessKycCollateralAssetsService} from './business-kyc-collateral-assets.service';
import {BusinessKycGuarantorDetailsService} from './business-kyc-guarantor-details.service';
import {BusinessKycProfileDetailsService} from './business-kyc-profile-details.service';

export class BusinessKycTransactionsService {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @repository(BusinessKycGuarantorRepository)
    private businessKycGuarantorRepository: BusinessKycGuarantorRepository,

    @repository(CompanyProfilesRepository)
    private companyProfileRepository: CompanyProfilesRepository,

    @inject('service.businessKycStatusService.service')
    private statusService: BusinessKycStatusService,

    @inject('service.businessKycProfileDetailsService.service')
    private profileService: BusinessKycProfileDetailsService,

    @inject('service.businessKycAuditedFinancialsService.service')
    private auditedService: BusinessKycAuditedFinancialsService,

    @inject('service.businessKycGuarantorDetailsService')
    private guarantorService: BusinessKycGuarantorDetailsService,

    @inject('service.businessKycCollateralAssetsService.service')
    private collateralService: BusinessKycCollateralAssetsService,
  ) { }

  /* ------------------------------------------------------------------ */
  /* 🔒 COMMON HELPERS */
  /* ------------------------------------------------------------------ */

  private async resolveCompanyAndKyc(userId: string) {
    const company = await this.companyProfileRepository.findOne({
      where: {usersId: userId, isActive: true, isDeleted: false},
    });

    if (!company) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    const kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: company.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not started');
    }

    return {company, kyc};
  }

  private async advanceStatusIfRequired(kycId: string, tx: unknown) {
    const currentStatus = await this.statusService.fetchApplicationStatusById(
      (await this.businessKycRepository.findById(kycId))
        .businessKycStatusMasterId!,
    );

    const nextStatus = await this.statusService.fetchNextStatus(
      currentStatus.sequenceOrder,
    );

    await this.businessKycRepository.updateById(
      kycId,
      {businessKycStatusMasterId: nextStatus.id, status: nextStatus.value},
      {transaction: tx},
    );

    return {
      id: nextStatus.id,
      label: nextStatus.status,
      code: nextStatus.value,
    };
  }

  /* ------------------------------------------------ */
  /* START KYC */
  /* ------------------------------------------------ */

  async startBusinessKyc(userId: string) {
    const company = await this.companyProfileRepository.findOne({
      where: {usersId: userId, isActive: true, isDeleted: false},
    });

    if (!company) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    const initialStatus = await this.statusService.fetchInitialStatus();

    let kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: company.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!kyc) {
      kyc = await this.businessKycRepository.create({
        companyProfilesId: company.id,
        businessKycStatusMasterId: initialStatus.id,
        status: initialStatus.value,
        isActive: true,
        isDeleted: false,
      });
    }

    return {
      success: true,
      data: {
        businessKycId: kyc.id,
        activeStep: {
          id: initialStatus.id,
          label: initialStatus.status,
          code: initialStatus.value,
        },
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* 1️⃣ PROFILE DETAILS */
  /* ------------------------------------------------------------------ */

  async updateProfileDetails(
    userId: string,
    payload: {
      yearInBusiness: number;
      turnover: number;
      projectedTurnover: number;
    },
  ) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {kyc} = await this.resolveCompanyAndKyc(userId);

      const result =
        await this.profileService.createOrUpdateBusinessKycProfileDetails(
          kyc.id!,
          payload,
          tx,
        );

      if (result.updateStatus) {
        const currentStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

        await tx.commit();
        return {profileDetails: result.profileDetails, currentStatus};
      }

      await tx.commit();
      return {profileDetails: result.profileDetails};
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2️⃣ AUDITED FINANCIALS */
  /* ------------------------------------------------------------------ */

  async updateAuditedFinancials(
    userId: string,
    auditedFinancials: Omit<BusinessKycAuditedFinancials, 'id'>[],
  ) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {kyc} = await this.resolveCompanyAndKyc(userId);

      const result = await this.auditedService.createOrUpdateAuditedFinancials(
        kyc.id!,

        auditedFinancials,
        tx,
      );

      // const isComplete = await this.auditedService.isAuditedFinancialsComplete(
      //   kyc.id!,
      //   tx,
      // );

      // if (isComplete && kyc.status === 'gst_3b') {
      //   const nextStatus = await this.advanceStatusIfRequired(kyc.id!, tx);
      //   await tx.commit();
      //   return {
      //     auditedFinancials: result.auditedFinancials,
      //     currentStatus: nextStatus,
      //   };
      // }
      const submittedCategory = auditedFinancials[0].category;

      // Get current status
      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      // Only advance if the submitted category matches the current status
      // This prevents skipping ahead
      if (currentStatus.value === submittedCategory) {
        // Advance to next status
        const nextStatus = await this.statusService.fetchNextStatus(
          currentStatus.sequenceOrder,
        );

        await this.businessKycRepository.updateById(
          kyc.id!,
          {
            businessKycStatusMasterId: nextStatus.id,
            status: nextStatus.value,
          },
          {transaction: tx},
        );

        await tx.commit();

        return {
          auditedFinancials: result.auditedFinancials,
          currentStatus: {
            id: nextStatus.id,
            label: nextStatus.status,
            code: nextStatus.value,
          },
        };
      }

      await tx.commit();
      return {auditedFinancials: result.auditedFinancials};
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 3️⃣ GUARANTOR */
  /* ------------------------------------------------------------------ */

  async addGuarantor(
    userId: string,
    payload: Omit<BusinessKycGuarantor, 'id' | 'businessKycId'>,
  ) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {kyc} = await this.resolveCompanyAndKyc(userId);

      const guarantor = await this.guarantorService.createGuarantor(
        kyc.id!,
        userId,
        payload,
        tx,
      );

      // const currentStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

      await tx.commit();
      return {guarantor};
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  async updateGuarantor(
    userId: string,
    guarantorId: string,
    body: Omit<BusinessKycGuarantor, 'id' | 'businessKycId'>,
  ) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      // const {kyc} = await this.resolveCompanyAndKyc(userId);

      const guarantor = await this.guarantorService.updateGuarantorById(
        guarantorId,
        userId,
        body,
        tx,
      );

      // const currentStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

      await tx.commit();
      return {guarantor};
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  async completeGuarantorStep(userId: string) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {kyc} = await this.resolveCompanyAndKyc(userId);

      // 1️⃣ Ensure at least one guarantor exists
      const guarantorCount = await this.guarantorService.countGuarantors(
        kyc.id!,
        tx,
      );

      if (guarantorCount === 0) {
        throw new HttpErrors.BadRequest(
          'At least one guarantor is required to continue',
        );
      }

      // 2️⃣ Get current status
      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      // ✅ CASE 1: Already completed → allow edit flow
      if (currentStatus.value === 'review_and_submit') {
        await tx.commit();
        return {
          currentStatus: {
            id: currentStatus.id,
            label: currentStatus.status,
            code: currentStatus.value,
          },
        };
      }

      // ❌ CASE 2: Invalid state (trying to skip steps)
      if (currentStatus.value !== 'guarantor_details') {
        throw new HttpErrors.BadRequest(
          `Cannot continue guarantor from ${currentStatus.value}`,
        );
      }

      // ✅ CASE 3: Normal flow → advance
      const nextStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

      await tx.commit();
      return {
        currentStatus: nextStatus,
      };
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }


  /* ------------------------------------------------------------------ */
  /* 4️⃣ COLLATERAL ASSETS */
  /* ------------------------------------------------------------------ */

  async updateCollateralAssets(
    userId: string,
    collateralAssets: Omit<BusinessKycCollateralAssets, 'id'>[],
  ) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {company, kyc} = await this.resolveCompanyAndKyc(userId);

      const result =
        await this.collateralService.createOrUpdateCollateralAssets(
          kyc.id!,
          company.id,
          collateralAssets,
          tx,
        );

      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      if (currentStatus.value === 'collateral_assets') {
        const nextStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

        await tx.commit();
        return {
          collateralAssets: result.collateralAssets,
          currentStatus: nextStatus,
        };
      }

      await tx.commit();
      return {collateralAssets: result.collateralAssets};
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }
}
