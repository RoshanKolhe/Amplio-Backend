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
import {BusinessKycAgreementService} from './business-kyc-agreement.service';

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

    @inject('service.businessKycAgreementService.service')
    private agreementService: BusinessKycAgreementService,
  ) {}

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
      const {kyc, company} = await this.resolveCompanyAndKyc(userId);

      const result =
        await this.profileService.createOrUpdateBusinessKycProfileDetails(
          kyc.id!,
          company.id,
          payload,
          tx,
        );

      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      if (!result.updateStatus && currentStatus.value === 'business_profile') {
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
          profileDetails: result.profileDetails,
          currentStatus: {
            id: nextStatus.id,
            label: nextStatus.status,
            code: nextStatus.value,
          },
        };
      }

      // Just update the data, don't advance status
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

      const verificationUrl =
        await this.guarantorService.createGuarantorVerificationLink(
          guarantor.id!,
          tx,
        );

      await tx.commit();
      return {guarantor, verificationUrl};
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

  async submitReview(userId: string) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {kyc} = await this.resolveCompanyAndKyc(userId);

      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      if (currentStatus.value !== 'review_and_submit') {
        throw new HttpErrors.BadRequest(
          `Cannot submit review from ${currentStatus.value}`,
        );
      }

      const nextStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

      await tx.commit();

      return {
        success: true,
        message: 'Review submitted successfully',
        currentStatus: nextStatus,
      };
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 🔟 AGREEMENTS */
  /* ------------------------------------------------------------------ */

  async completeAgreementStep(userId: string) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {kyc, company} = await this.resolveCompanyAndKyc(userId);

      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      if (currentStatus.value !== 'agreements') {
        throw new HttpErrors.BadRequest(
          `Cannot continue agreements from ${currentStatus.value}`,
        );
      }

      // create agreements if not already created
      await this.agreementService.createAgreements(kyc.id!, company.id, tx);

      // validate + approve
      await this.agreementService.finalizeAgreements(kyc.id!, tx);

      // advance status
      const nextStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

      await tx.commit();

      return {
        success: true,
        message: 'Agreements completed successfully',
        currentStatus: nextStatus,
      };
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  async updateAgreement(userId: string, isAccepted: boolean, reason: string) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const {kyc, company} = await this.resolveCompanyAndKyc(userId);

      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      if (currentStatus.value !== 'agreement') {
        throw new HttpErrors.BadRequest(
          `Cannot update agreements from ${currentStatus.value}`,
        );
      }

      // ensure agreements exist
      await this.agreementService.createAgreements(kyc.id!, company.id, tx);

      // ✅ update agreement using businessKycId + businessKycDocumentTypeId
      // await this.agreementService.updateAcceptanceByDocumentType(
      //   kyc.id!,
      //   businessKycDocumentTypeId,
      //   isAccepted,
      //   reason,
      //   tx,
      // );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextAgreement: any =
        await this.agreementService.fetchNextPendingAgreement(kyc.id!, tx);

      if (!nextAgreement) {
        throw new HttpErrors.BadRequest('All agreements already accepted');
      }

      await this.agreementService.updateAcceptanceById(
        nextAgreement.id!,
        isAccepted,
        reason,
        tx,
      );

      const allAccepted = await this.agreementService.areAllAccepted(
        kyc.id!,
        tx,
      );

      await tx.commit();
      const agreementName =
        nextAgreement.businessKycDocumentType?.name ?? 'Agreement';

      return {
        success: true,
        message: allAccepted
        ? `${agreementName} completed. All agreements accepted. Proceed to e-sign.`
        : `${agreementName} agreement is complete.`,
        readyForEsign: allAccepted,
      };
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  async completeAgreementSigning(userId: string) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction();

    try {
      const {kyc} = await this.resolveCompanyAndKyc(userId);

      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      if (currentStatus.value !== 'agreement') {
        throw new HttpErrors.BadRequest(
          `Cannot complete agreement from ${currentStatus.value}`,
        );
      }

      // 🔥 ensure all accepted
      const allAccepted = await this.agreementService.areAllAccepted(
        kyc.id!,
        tx,
      );

      if (!allAccepted) {
        throw new HttpErrors.BadRequest('Accept all agreements before signing');
      }

      // 🔥 ensure signed docs exist
      const allSigned = await this.agreementService.areAllSigned(kyc.id!, tx);

      if (!allSigned) {
        throw new HttpErrors.BadRequest('Documents not signed properly');
      }

      // finalize
      await this.agreementService.finalizeAgreements(kyc.id!, tx);

      const nextStatus = await this.advanceStatusIfRequired(kyc.id!, tx);

      await tx.commit();

      return {
        success: true,
        message: 'Agreements completed successfully',
        currentStatus: nextStatus,
      };
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  async fetchAgreements(userId: string) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });
    try {
      const {kyc, company} = await this.resolveCompanyAndKyc(userId);

      const currentStatus = await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

      if (currentStatus.value !== 'agreement') {
        throw new HttpErrors.BadRequest(
          `Agreements not available in ${currentStatus.value} stage`,
        );
      }

      // ✅ create agreements safely
      await this.agreementService.createAgreements(kyc.id!, company.id, tx);

      const agreements = await this.agreementService.fetchAgreements(
        kyc.id!,
        tx,
      );

      await tx.commit();

      return agreements;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

async advanceWorkflow(companyId: string) {
  const tx = await this.businessKycRepository.dataSource.beginTransaction({
    isolationLevel: IsolationLevel.READ_COMMITTED,
  });

  try {
    const kyc = await this.businessKycRepository.findOne(
      {
        where: {
          companyProfilesId: companyId,
          isActive: true,
          isDeleted: false,
        },
      },
      {transaction: tx},
    );

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not found');
    }

    await this.businessKycRepository.execute(
      `SELECT id FROM business_kyc WHERE id = $1 FOR UPDATE`,
      [kyc.id],
      {transaction: tx},
    );

    const currentStatus =
      await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

    if (currentStatus.value?.toLowerCase() !== 'pending') {
      throw new HttpErrors.BadRequest(
        `Workflow can only advance from "pending". Current stage is "${currentStatus.value}".`,
      );
    }

    const nextStatus =
      await this.statusService.fetchNextStatus(
        currentStatus.sequenceOrder,
      );

    if (!nextStatus) {
      throw new HttpErrors.BadRequest(
        'Next workflow status is not configured.',
      );
    }

    let agreements: any[] = [];

    if (nextStatus.value?.toLowerCase().includes('agreement')) {
      await this.agreementService.createAgreements(
        kyc.id!,
        kyc.companyProfilesId,
        tx,
      );

      agreements = await this.agreementService.fetchAgreements(
        kyc.id!,
        tx,
      );
    }

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
      success: true,
      message: `Workflow moved to ${nextStatus.value}`,
      currentStatus: {
        id: nextStatus.id,
        status: nextStatus.status,
        value: nextStatus.value,
        sequenceOrder: nextStatus.sequenceOrder,
      },
      documents: agreements,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

}
