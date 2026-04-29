import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, IsolationLevel, repository} from '@loopback/repository';
import {
  del,
  get,
  HttpErrors,
  param,
  patch,
  requestBody,
} from '@loopback/rest';
import {authorize} from '../authorization';
import {SpvApplication, SpvKycDocument} from '../models';
import {
  EscrowSetupRepository,
  EscrowTransactionRepository,
  InvestorClosedInvestmentRepository,
  InvestorEscrowLedgerRepository,
  InvestorPtcHoldingRepository,
  IsinApplicationRepository,
  MerchantPayoutBatchItemRepository,
  PoolFinancialsRepository,
  PoolSummaryRepository,
  PoolTransactionRepository,
  PtcIssuanceRepository,
  PtcParametersRepository,
  SpvApplicationCreditRatingRepository,
  SpvApplicationRepository,
  SpvKycDocumentRepository,
  SpvRepository,
  TransactionRepository,
  TrustDeedRepository,
} from '../repositories';
import {MediaService} from '../services/media.service';
import {SpvApplicationTransactionsService} from '../services/spv-application-transactions.service';

export class SpvSuperAdminController {
  constructor(
    @inject('service.spvApplicationTransactions.service')
    private spvApplicationTransactionsService: SpvApplicationTransactionsService,
    @inject('service.media.service')
    private mediaService: MediaService,
    @repository(SpvApplicationRepository)
    private spvApplicationsRepository: SpvApplicationRepository,
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(SpvKycDocumentRepository)
    private spvKycDocumentRepository: SpvKycDocumentRepository,
    @repository(SpvApplicationCreditRatingRepository)
    private spvApplicationCreditRatingRepository: SpvApplicationCreditRatingRepository,
    @repository(PtcParametersRepository)
    private ptcParametersRepository: PtcParametersRepository,
    @repository(TrustDeedRepository)
    private trustDeedRepository: TrustDeedRepository,
    @repository(EscrowSetupRepository)
    private escrowSetupRepository: EscrowSetupRepository,
    @repository(IsinApplicationRepository)
    private isinApplicationRepository: IsinApplicationRepository,
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
    @repository(PoolSummaryRepository)
    private poolSummaryRepository: PoolSummaryRepository,
    @repository(PoolTransactionRepository)
    private poolTransactionRepository: PoolTransactionRepository,
    @repository(EscrowTransactionRepository)
    private escrowTransactionRepository: EscrowTransactionRepository,
    @repository(PtcIssuanceRepository)
    private ptcIssuanceRepository: PtcIssuanceRepository,
    @repository(InvestorPtcHoldingRepository)
    private investorPtcHoldingRepository: InvestorPtcHoldingRepository,
    @repository(InvestorClosedInvestmentRepository)
    private investorClosedInvestmentRepository: InvestorClosedInvestmentRepository,
    @repository(InvestorEscrowLedgerRepository)
    private investorEscrowLedgerRepository: InvestorEscrowLedgerRepository,
    @repository(MerchantPayoutBatchItemRepository)
    private merchantPayoutBatchItemRepository: MerchantPayoutBatchItemRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/admin/spv-pre/documents/{applicationId}/{documentId}')
  async updateDocumentById(
    @param.path.string('applicationId') applicationId: string,
    @param.path.string('documentId') documentId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              mediaId: {type: 'string'},
              isAccepted: {type: 'boolean'},
              reason: {type: 'string'},
              status: {type: 'number'},
              sequenceOrder: {type: 'number'},
              trusteeSignStatus: {
                type: 'string',
                enum: ['not_required', 'locked', 'pending', 'signed'],
              },
              trusteeSignedAt: {type: 'string', format: 'date-time'},
            },
          },
        },
      },
    })
    payload: Partial<
      Pick<
        SpvKycDocument,
        | 'mediaId'
        | 'isAccepted'
        | 'reason'
        | 'status'
        | 'sequenceOrder'
        | 'trusteeSignStatus'
        | 'trusteeSignedAt'
      >
    >,
  ) {
    const details =
      await this.spvApplicationTransactionsService.updateDocumentByIdForAdmin(
        applicationId,
        documentId,
        payload,
      );

    return {
      success: true,
      message: 'SPV document updated by super admin',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/admin/spv-pre/applications/{applicationId}/verification')
  async verifyApplication(
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status'],
            properties: {
              status: {type: 'number', enum: [1, 2]},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      reason?: string;
    },
  ) {
    const details =
      await this.spvApplicationTransactionsService.verifyApplicationByAdmin(
        applicationId,
        body.status,
        body.reason ?? '',
      );

    return {
      success: true,
      message: 'SPV application verification updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @del('/admin/spv/{spvId}/purge')
  async purgeSpv(
    @param.path.string('spvId') spvId: string,
  ): Promise<{
    success: boolean;
    message: string;
    spvId: string;
    spvApplicationId: string;
    deleted: {
      merchantPayoutBatchItems: number;
      investorEscrowLedgers: number;
      investorPtcHoldings: number;
      investorClosedInvestments: number;
      escrowTransactions: number;
      poolTransactions: number;
      ptcIssuances: number;
      transactions: number;
      poolSummaries: number;
      poolFinancials: number;
      spvDocuments: number;
      spvApplicationCreditRatings: number;
      ptcParameters: number;
      trustDeeds: number;
      escrowSetups: number;
      isinApplications: number;
      spv: number;
      spvApplication: number;
    };
  }> {
    const tx =
      await this.spvApplicationsRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const spv = await this.spvRepository.findOne(
        {
          where: {
            and: [{id: spvId}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!spv) {
        throw new HttpErrors.NotFound('SPV not found');
      }

      const spvApplicationId = spv.spvApplicationId;

      const spvDocuments = await this.spvKycDocumentRepository.find(
        {
          where: {spvApplicationId},
        },
        {transaction: tx},
      );

      const creditRatings = await this.spvApplicationCreditRatingRepository.find(
        {
          where: {spvApplicationId},
        },
        {transaction: tx},
      );

      const trustDeeds = await this.trustDeedRepository.find(
        {
          where: {spvApplicationId},
        },
        {transaction: tx},
      );

      const isinApplications = await this.isinApplicationRepository.find(
        {
          where: {spvApplicationId},
        },
        {transaction: tx},
      );

      const mediaIds = Array.from(
        new Set(
          [
            ...spvDocuments.map(doc => doc.mediaId),
            ...creditRatings.map(rating => rating.ratingLetterId),
            ...trustDeeds.map(deed => deed.stampDutyAndRegistrationId),
            ...isinApplications.map(isin => isin.isinLetterDocId),
          ].filter((id): id is string => !!id),
        ),
      );

      const spvTransactions = await this.transactionRepository.find(
        {
          where: {spvId: spv.id},
          fields: {id: true},
        },
        {transaction: tx},
      );
      const transactionIds = spvTransactions.map(transaction => transaction.id);

      const deletedMerchantPayoutBatchItems = transactionIds.length
        ? await this.merchantPayoutBatchItemRepository.deleteAll(
            {
              transactionId: {inq: transactionIds},
            },
            {transaction: tx},
          )
        : {count: 0};

      const deletedInvestorEscrowLedgers =
        await this.investorEscrowLedgerRepository.deleteAll(
          {
            referenceId: spv.id,
          },
          {transaction: tx},
        );

      const deletedInvestorPtcHoldings =
        await this.investorPtcHoldingRepository.deleteAll(
          {
            spvId: spv.id,
          },
          {transaction: tx},
        );

      const deletedInvestorClosedInvestments =
        await this.investorClosedInvestmentRepository.deleteAll(
          {
            spvId: spv.id,
          },
          {transaction: tx},
        );

      const deletedEscrowTransactions =
        await this.escrowTransactionRepository.deleteAll(
          {
            spvId: spv.id,
          },
          {transaction: tx},
        );

      const deletedPoolTransactions = await this.poolTransactionRepository.deleteAll(
        {
          spvId: spv.id,
        },
        {transaction: tx},
      );

      const deletedPtcIssuances = await this.ptcIssuanceRepository.deleteAll(
        {
          spvId: spv.id,
        },
        {transaction: tx},
      );

      const deletedTransactions = await this.transactionRepository.deleteAll(
        {
          spvId: spv.id,
        },
        {transaction: tx},
      );

      const deletedPoolSummaries = await this.poolSummaryRepository.deleteAll(
        {
          spvId: spv.id,
        },
        {transaction: tx},
      );

      const deletedPoolFinancials = await this.poolFinancialsRepository.deleteAll(
        {
          or: [{spvId: spv.id}, {spvApplicationId}],
        },
        {transaction: tx},
      );

      const deletedSpvDocuments = await this.spvKycDocumentRepository.deleteAll(
        {
          spvApplicationId,
        },
        {transaction: tx},
      );

      const deletedSpvApplicationCreditRatings =
        await this.spvApplicationCreditRatingRepository.deleteAll(
          {
            spvApplicationId,
          },
          {transaction: tx},
        );

      const deletedPtcParameters = await this.ptcParametersRepository.deleteAll(
        {
          spvApplicationId,
        },
        {transaction: tx},
      );

      const deletedTrustDeeds = await this.trustDeedRepository.deleteAll(
        {
          spvApplicationId,
        },
        {transaction: tx},
      );

      const deletedEscrowSetups = await this.escrowSetupRepository.deleteAll(
        {
          spvApplicationId,
        },
        {transaction: tx},
      );

      const deletedIsinApplications = await this.isinApplicationRepository.deleteAll(
        {
          spvApplicationId,
        },
        {transaction: tx},
      );

      const deletedSpv = await this.spvRepository.deleteAll(
        {
          id: spv.id,
        },
        {transaction: tx},
      );

      const deletedSpvApplication = await this.spvApplicationsRepository.deleteAll(
        {
          id: spvApplicationId,
        },
        {transaction: tx},
      );

      await tx.commit();

      await this.mediaService.updateMediaUsedStatus(mediaIds, false);

      return {
        success: true,
        message: 'SPV and related records deleted successfully',
        spvId: spv.id,
        spvApplicationId,
        deleted: {
          merchantPayoutBatchItems: deletedMerchantPayoutBatchItems.count,
          investorEscrowLedgers: deletedInvestorEscrowLedgers.count,
          investorPtcHoldings: deletedInvestorPtcHoldings.count,
          investorClosedInvestments: deletedInvestorClosedInvestments.count,
          escrowTransactions: deletedEscrowTransactions.count,
          poolTransactions: deletedPoolTransactions.count,
          ptcIssuances: deletedPtcIssuances.count,
          transactions: deletedTransactions.count,
          poolSummaries: deletedPoolSummaries.count,
          poolFinancials: deletedPoolFinancials.count,
          spvDocuments: deletedSpvDocuments.count,
          spvApplicationCreditRatings: deletedSpvApplicationCreditRatings.count,
          ptcParameters: deletedPtcParameters.count,
          trustDeeds: deletedTrustDeeds.count,
          escrowSetups: deletedEscrowSetups.count,
          isinApplications: deletedIsinApplications.count,
          spv: deletedSpv.count,
          spvApplication: deletedSpvApplication.count,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/super-admin/spv-applications')
  async getSpvApplications(
    @param.filter(SpvApplication) filter?: Filter<SpvApplication>,
    @param.query.number('status') status?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: SpvApplication[];
    count: {
      totalCount: number;
    };
  }> {
    const rootWhere = {
      ...filter?.where,
    };

    const spvApplications = await this.spvApplicationsRepository.find({
      ...filter,
      where: rootWhere,
      limit: filter?.limit ?? 10,
      skip: filter?.skip ?? 0,
      order: filter?.order ?? ['createdAt DESC'],
    });

    const totalCount = (await this.spvApplicationsRepository.count(filter?.where))
      .count;

    return {
      success: true,
      message: 'SPV Applications',
      data: spvApplications,
      count: {
        totalCount,
      },
    };
  }
}
