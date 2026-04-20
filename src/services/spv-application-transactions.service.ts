import {inject} from '@loopback/core';
import {IsolationLevel} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {AmplioDataSource} from '../datasources';
import {
  EscrowSetup,
  CreditRatings,
  PoolFinancials,
  PtcParameters,
  Spv,
  SpvApplicationCreditRating,
  SpvKycDocument,
  SpvKycDocumentWithRelations,
  TrustDeed,
  IsinApplication,
} from '../models';
import {EscrowSetupService} from './escrow-setup.service';
import {PoolFinancialsService} from './pool-financials.service';
import {PtcParametersService} from './ptc-parameters.service';
import {SpvApplicationService} from './spv-application.service';
import {SpvApplicationCreditRatingService} from './spv-application-credit-rating.service';
import {SpvApplicationStatusService} from './spv-application-status.service';
import {SpvService} from './spv.service';
import {SpvKycDocumentService} from './spv-kyc-document.service';
import {TrustDeedService} from './trust-deed.service';
import {IsinApplicationService} from './isin-application.service';

type TrustDeedSavePayload = Pick<TrustDeed, 'trustName'> &
  Partial<
    Pick<
      TrustDeed,
      | 'trusteeEntity'
      | 'settlor'
      | 'governingLaw'
      | 'bankruptcyClause'
      | 'trustDuration'
      | 'isActive'
      | 'isDeleted'
    >
  >;

type IsinApplicationSavePayload = Pick<
  IsinApplication,
  'depositoryId' | 'securityType' | 'isinNumber' | 'issueDate'
> &
  Partial<
    Pick<
      IsinApplication,
      | 'issueSize'
      | 'creditRating'
      | 'isinLetterDocId'
      | 'isActive'
      | 'isDeleted'
    >
  >;

export class SpvApplicationTransactionsService {
  constructor(
    @inject('datasources.amplio')
    private datasource: AmplioDataSource,
    @inject('service.spvApplication.service')
    private spvApplicationService: SpvApplicationService,
    @inject('service.spvApplicationStatus.service')
    private statusService: SpvApplicationStatusService,
    @inject('service.spv.service')
    private spvService: SpvService,
    @inject('service.poolFinancials.service')
    private poolFinancialsService: PoolFinancialsService,
    @inject('service.spvApplicationCreditRating.service')
    private spvApplicationCreditRatingService: SpvApplicationCreditRatingService,
    @inject('service.escrowSetup.service')
    private escrowSetupService: EscrowSetupService,
    @inject('service.ptcParameters.service')
    private ptcParametersService: PtcParametersService,
    @inject('service.trustDeed.service')
    private trustDeedService: TrustDeedService,
    @inject('service.spvKycDocument.service')
    private spvKycDocumentService: SpvKycDocumentService,
    @inject('service.isinApplication.service')
    private isinApplicationService: IsinApplicationService,
  ) {}

  private async syncApplicationStatus(
    applicationId: string,
    currentStatusId: string,
    targetStatusValue: string,
    tx: unknown,
  ) {
    const currentStatus = await this.statusService.fetchApplicationStatusById(
      currentStatusId,
    );
    const targetStatus = await this.statusService.verifyStatusValue(
      targetStatusValue,
    );

    if (targetStatus.sequenceOrder > currentStatus.sequenceOrder) {
      await this.spvApplicationService.updateApplicationStatus(
        applicationId,
        targetStatus.id,
        tx,
      );

      return targetStatus;
    }

    return currentStatus;
  }

  private async syncDocumentsStepIfCompleted(
    applicationId: string,
    currentStatusId: string,
    tx: unknown,
  ) {
    const documents =
      await this.spvKycDocumentService.fetchDocumentsByApplicationId(
        applicationId,
      );

    const allDocumentsCompleted =
      documents.length > 0 && documents.every(document => document.status === 1);

    if (!allDocumentsCompleted) {
      return this.statusService.fetchApplicationStatusById(currentStatusId);
    }

    return this.syncApplicationStatus(
      applicationId,
      currentStatusId,
      'documents',
      tx,
    );
  }

  async createOrUpdateBasicInfo(
    trusteeProfileId: string,
    applicationId: string,
    spvData: Omit<Spv, 'id' | 'spvApplicationId'>,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      const response = await this.spvService.createOrUpdateSpv(
        applicationId,
        spvData,
        tx,
      );

      const currentStatus = await this.syncApplicationStatus(
        application.id,
        application.spvApplicationStatusMasterId,
        'spv_basic_info',
        tx,
      );

      await tx.commit();

      return {
        applicationId: response.applicationId,
        spv: response.spv,
        currentStatus: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async createOrUpdatePoolFinancials(
    trusteeProfileId: string,
    applicationId: string,
    payload: Omit<PoolFinancials, 'id' | 'spvApplicationId'>,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      const poolFinancials = await this.poolFinancialsService.createOrUpdate(
        applicationId,
        payload,
        tx,
      );

      const currentStatus = await this.syncApplicationStatus(
        application.id,
        application.spvApplicationStatusMasterId,
        'pool_financials',
        tx,
      );

      await tx.commit();

      return {
        applicationId,
        poolFinancials,
        currentStatus: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async createOrUpdatePtcParameters(
    trusteeProfileId: string,
    applicationId: string,
    payload: Omit<PtcParameters, 'id' | 'spvApplicationId'>,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      const ptcParameters = await this.ptcParametersService.createOrUpdate(
        applicationId,
        payload,
        tx,
      );

      const currentStatus = await this.syncApplicationStatus(
        application.id,
        application.spvApplicationStatusMasterId,
        'ptc_parameters',
        tx,
      );

      await tx.commit();

      return {
        applicationId,
        ptcParameters,
        currentStatus: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async createOrUpdateCreditRating(
    trusteeProfileId: string,
    applicationId: string,
    payload: Omit<SpvApplicationCreditRating, 'id' | 'spvApplicationId'>,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      const creditRating =
        await this.spvApplicationCreditRatingService.createOrUpdate(
          applicationId,
          payload,
          tx,
        );

      const currentStatus = await this.syncApplicationStatus(
        application.id,
        application.spvApplicationStatusMasterId,
        'credit_rating',
        tx,
      );

      await tx.commit();

      return {
        applicationId,
        creditRating,
        currentStatus: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async createOrUpdateTrustDeed(
    trusteeProfileId: string,
    applicationId: string,
    payload: TrustDeedSavePayload,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      const trustDeed = await this.trustDeedService.createOrUpdate(
        applicationId,
        payload,
        tx,
      );

      await this.spvKycDocumentService.createDefaultDocuments(applicationId, tx);

      await this.spvKycDocumentService.createDocumentFromTemplate(
        applicationId,
        'trust_deed',
        tx,
        {
          sequenceOrder: 1,
        },
      );

      const currentStatus = await this.syncApplicationStatus(
        application.id,
        application.spvApplicationStatusMasterId,
        'trust_deed',
        tx,
      );

      await tx.commit();

      const trustDeedResponse =
        await this.trustDeedService.fetchByApplicationIdOrFail(applicationId);

      return {
        applicationId,
        trustDeed: trustDeedResponse,
        currentStatus: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async createOrUpdateEscrowSetup(
    trusteeProfileId: string,
    applicationId: string,
    payload: Omit<EscrowSetup, 'id' | 'spvApplicationId'>,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      const trustDeed = await this.trustDeedService.fetchByApplicationIdOrFail(
        applicationId,
      );

      if (trustDeed.signing.trustee.status !== 'signed') {
        throw new HttpErrors.BadRequest(
          'Trust deed must be signed by the trustee before escrow setup',
        );
      }

      const escrowSetup = await this.escrowSetupService.createOrUpdate(
        applicationId,
        payload,
        tx,
      );

      const currentStatus = await this.syncApplicationStatus(
        application.id,
        application.spvApplicationStatusMasterId,
        'escrow',
        tx,
      );

      await tx.commit();

      return {
        applicationId,
        escrowSetup,
        currentStatus: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async createOrUpdateIsinApplication(
    trusteeProfileId: string,
    applicationId: string,
    payload: IsinApplicationSavePayload,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      const [poolFinancials, creditRating] = await Promise.all([
        this.poolFinancialsService.fetchByApplicationIdOrFail(applicationId),
        this.spvApplicationCreditRatingService.fetchByApplicationIdOrFail(
          applicationId,
        ),
      ]);
      const creditRatingWithRelations = creditRating as
        SpvApplicationCreditRating & {
          creditRatings?: CreditRatings;
        };

      const isinApplication = await this.isinApplicationService.createOrUpdate(
        applicationId,
        {
          ...payload,
          issueSize: String(poolFinancials.poolLimit),
          creditRating:
            creditRatingWithRelations.creditRatings?.name ??
            creditRatingWithRelations.creditRatings?.value ??
            payload.creditRating,
          isActive: true,
          isDeleted: false,
        },
        tx,
      );

      const currentStatus = await this.syncApplicationStatus(
        application.id,
        application.spvApplicationStatusMasterId,
        'isin_application',
        tx,
      );

      await tx.commit();

      return {
        applicationId,
        isinApplication,
        currentStatus: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async fetchDocumentsByApplicationId(
    trusteeProfileId: string,
    applicationId: string,
  ): Promise<SpvKycDocumentWithRelations[]> {
    await this.spvApplicationService.verifyApplicationWithTrustee(
      trusteeProfileId,
      applicationId,
    );

    return this.spvKycDocumentService.fetchDocumentsByApplicationId(applicationId);
  }

  async updateDocumentById(
    trusteeProfileId: string,
    applicationId: string,
    documentId: string,
    payload: Partial<SpvKycDocument>,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application =
        await this.spvApplicationService.verifyApplicationWithTrustee(
          trusteeProfileId,
          applicationId,
        );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      let updatedDocument = await this.spvKycDocumentService.updateDocumentById(
        documentId,
        payload,
        tx,
      );
      await this.syncDocumentsStepIfCompleted(
        application.id,
        application.spvApplicationStatusMasterId,
        tx,
      );

      await tx.commit();

      return {
        applicationId,
        document: updatedDocument,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async updateDocumentByIdForAdmin(
    applicationId: string,
    documentId: string,
    payload: Partial<SpvKycDocument>,
  ) {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const application = await this.spvApplicationService.verifyApplicationExists(
        applicationId,
      );

      if (application.status === 1) {
        throw new HttpErrors.BadRequest(
          'Approved SPV application cannot be modified',
        );
      }

      let updatedDocument = await this.spvKycDocumentService.updateDocumentById(
        documentId,
        payload,
        tx,
      );
      await this.syncDocumentsStepIfCompleted(
        application.id,
        application.spvApplicationStatusMasterId,
        tx,
      );

      await tx.commit();

      return {
        applicationId,
        document: updatedDocument,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
