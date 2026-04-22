import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  get,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {
  EscrowSetup,
  PoolFinancials,
  PtcParameters,
  Spv,
  SpvApplication,
  SpvApplicationCreditRating,
  SpvKycDocument,
  TrusteeProfiles,
  TrustDeed,
  IsinApplication,
} from '../models';
import {TrusteeProfilesRepository} from '../repositories';
import {SpvApplicationTransactionsService} from '../services/spv-application-transactions.service';
import {SpvApplicationService} from '../services/spv-application.service';

export class SpvController {
  constructor(
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @inject('service.spvApplication.service')
    private spvApplicationService: SpvApplicationService,
    @inject('service.spvApplicationTransactions.service')
    private spvApplicationTransactionsService: SpvApplicationTransactionsService,
  ) { }

  async verifyTrustee(usersId: string): Promise<TrusteeProfiles> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('No Trustee found');
    }

    return trusteeProfile;
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-applications')
  async fetchSpvApplications(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.filter(SpvApplication) filter?: Filter<SpvApplication>,
  ): Promise<{
    success: boolean;
    message: string;
    applications: {
      id: string;
      currentStatus: {
        id: string;
        label: string;
        code: string;
      };
      reviewStatus: number;
      isActive: boolean;
      createdAt: Date | undefined;
    }[];
  }> {
    const trusteeProfile = await this.verifyTrustee(currentUser.id);
    const applicationsList =
      await this.spvApplicationService.fetchApplicationsList(
        trusteeProfile.id,
        filter,
      );

    return {
      success: true,
      message: 'SPV Applications',
      applications: applicationsList,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-application/{applicationId}')
  async fetchApplicationById(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ): Promise<{
    success: boolean;
    message: string;
    applicationData: {
      id: string;
      completedSteps: {
        id: string;
        label: string;
        code: string;
      }[];
      activeStep: {
        id: string;
        label: string;
        code: string;
      };
    };
  }> {
    const trustee = await this.verifyTrustee(currentUser.id);
    const applicationData = await this.spvApplicationService.fetchSingleApplication(
      trustee.id,
      applicationId,
    );

    return {
      success: true,
      message: 'Application Data',
      applicationData,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-applications/{applicationId}/data-by-status/{statusValue}')
  async fetchDataByStatusValue(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @param.path.string('statusValue') statusValue: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const data = await this.spvApplicationService.fetchDataByStatusValue(
      trustee.id,
      applicationId,
      statusValue,
    );

    return {
      success: true,
      message: 'Data with status',
      stepData: data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @post('/spv-pre/new-application')
  async createNewApplication(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    application: {
      id: string;
      currentStatus: {
        id: string;
        label: string;
        code: string;
      };
      isActive: boolean;
    };
  }> {
    const trusteeProfile = await this.verifyTrustee(currentUser.id);
    const newApplication =
      await this.spvApplicationService.createNewApplication(trusteeProfile.id);

    return {
      success: true,
      message: 'New Application created',
      application: {
        id: newApplication.id,
        currentStatus: newApplication.currentStatus,
        isActive: newApplication.isActive ?? true,
      },
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/basic-info/{applicationId}')
  async updateBasicInfo(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['pspMasterId', 'originatorName', 'spvName'],
            properties: {
              pspMasterId: {type: 'string'},
              originatorName: {type: 'string'},
              spvName: {type: 'string'},
            },
          },
        },
      },
    })
    spvData: Omit<
      Spv,
      | 'id'
      | 'spvApplicationId'
      | 'isActive'
      | 'isDeleted'
      | 'createdAt'
      | 'updatedAt'
      | 'deletedAt'
    >,
  ): Promise<{
    success: boolean;
    message: string;
    details: {
      applicationId: string;
      spv: Spv;
      currentStatus: {
        id: string;
        label: string;
        code: string;
      };
    };
  }> {
    const trustee = await this.verifyTrustee(currentUser.id);
    const details =
      await this.spvApplicationTransactionsService.createOrUpdateBasicInfo(
        trustee.id,
        applicationId,
        {
          ...spvData,
          isActive: true,
          isDeleted: false,
        },
      );

    return {
      success: true,
      message: 'SPV basic info updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/pool-financials/{applicationId}')
  async updatePoolFinancials(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'poolLimit',
              'maturityDays',
              'targetYield',
              'reserveBufferPercent',
            ],
            properties: {
              poolLimit: {type: 'number'},
              maturityDays: {type: 'number'},
              targetYield: {type: 'number'},
              reserveBufferPercent: {type: 'number'},
              reserveAmount: {type: 'number'},
              dailyCutoffTime: {type: 'string'},
            },
          },
        },
      },
    })
    payload: Omit<
      PoolFinancials,
      | 'id'
      | 'spvApplicationId'
      | 'isActive'
      | 'isDeleted'
      | 'createdAt'
      | 'updatedAt'
      | 'deletedAt'
    >,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const details =
      await this.spvApplicationTransactionsService.createOrUpdatePoolFinancials(
        trustee.id,
        applicationId,
        {
          ...payload,
          isActive: true,
          isDeleted: false,
        },
      );

    return {
      success: true,
      message: 'Pool financials updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-pre/pool-financials/{applicationId}')
  async fetchPoolFinancials(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const stepData = await this.spvApplicationService.fetchDataByStatusValue(
      trustee.id,
      applicationId,
      'pool_financials',
    );

    return {
      success: true,
      message: 'Pool financials data',
      data: stepData,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/credit-rating/{applicationId}')
  async updateCreditRating(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'creditRatingAgenciesId',
              'creditRatingsId',
              'ratingLetterId',
              'ratingDate',
            ],
            properties: {
              creditRatingAgenciesId: {type: 'string'},
              creditRatingsId: {type: 'string'},
              ratingLetterId: {type: 'string'},
              ratingDate: {type: 'string', format: 'date'},
            },
          },
        },
      },
    })
    payload: Omit<
      SpvApplicationCreditRating,
      | 'id'
      | 'spvApplicationId'
      | 'isActive'
      | 'isDeleted'
      | 'createdAt'
      | 'updatedAt'
      | 'deletedAt'
    >,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const details =
      await this.spvApplicationTransactionsService.createOrUpdateCreditRating(
        trustee.id,
        applicationId,
        {
          ...payload,
          isActive: true,
          isDeleted: false,
        },
      );

    return {
      success: true,
      message: 'Credit rating updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-pre/credit-rating/{applicationId}')
  async fetchCreditRating(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const stepData = await this.spvApplicationService.fetchDataByStatusValue(
      trustee.id,
      applicationId,
      'credit_rating',
    );

    return {
      success: true,
      message: 'Credit rating data',
      data: stepData,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/ptc-parameters/{applicationId}')
  async updatePtcParameters(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['faceValuePerUnit', 'minInvestment'],
            properties: {
              faceValuePerUnit: {type: 'number'},
              minInvestment: {type: 'number'},
              maxUnitsPerInvestor: {type: 'number'},
              maxInvestors: {type: 'number'},
              windowFrequency: {type: 'string'},
              windowDurationHours: {type: 'number'},
            },
          },
        },
      },
    })
    payload: Omit<
      PtcParameters,
      | 'id'
      | 'spvApplicationId'
      | 'isActive'
      | 'isDeleted'
      | 'createdAt'
      | 'updatedAt'
      | 'deletedAt'
    >,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const details =
      await this.spvApplicationTransactionsService.createOrUpdatePtcParameters(
        trustee.id,
        applicationId,
        {
          ...payload,
          isActive: true,
          isDeleted: false,
        },
      );

    return {
      success: true,
      message: 'PTC parameters updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-pre/ptc-parameters/{applicationId}')
  async fetchPtcParameters(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const stepData = await this.spvApplicationService.fetchDataByStatusValue(
      trustee.id,
      applicationId,
      'ptc_parameters',
    );

    return {
      success: true,
      message: 'PTC parameters data',
      data: stepData,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/trust-deed/{applicationId}')
  async updateTrustDeed(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['trustName'],
            properties: {
              trustName: {type: 'string'},
              trusteeEntity: {type: 'string'},
              settlor: {type: 'string'},
              governingLaw: {type: 'string'},
              bankruptcyClause: {type: 'string'},
              trustDuration: {type: 'string'},
              stampDutyAndRegistrationId: {type: 'string'},
            },
          },
        },
      },
    })
    payload: Omit<
      TrustDeed,
      | 'id'
      | 'spvApplicationId'
      | 'trusteeSignStatus'
      | 'trusteeSignedAt'
      | 'settlorSignStatus'
      | 'settlorSignedAt'
      | 'isActive'
      | 'isDeleted'
      | 'createdAt'
      | 'updatedAt'
      | 'deletedAt'
    >,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const details =
      await this.spvApplicationTransactionsService.createOrUpdateTrustDeed(
        trustee.id,
        applicationId,
        {
          ...payload,
          isActive: true,
          isDeleted: false,
        },
      );

    return {
      success: true,
      message: 'Trust deed updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-pre/trust-deed/{applicationId}')
  async fetchTrustDeed(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const stepData = await this.spvApplicationService.fetchDataByStatusValue(
      trustee.id,
      applicationId,
      'trust_deed',
    );

    return {
      success: true,
      message: 'Trust deed data',
      data: stepData,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/escrow/{applicationId}')
  async updateEscrowSetup(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['bankName', 'accountNumber', 'ifscCode', 'accountType'],
            properties: {
              bankName: {type: 'string'},
              branchDetails: {type: 'string'},
              accountNumber: {type: 'string'},
              ifscCode: {type: 'string'},
              accountType: {
                type: 'string',
                enum: ['collection_escrow', 'reserve_escrow'],
              },
            },
          },
        },
      },
    })
    payload: Omit<
      EscrowSetup,
      | 'id'
      | 'spvApplicationId'
      | 'isActive'
      | 'isDeleted'
      | 'createdAt'
      | 'updatedAt'
      | 'deletedAt'
    >,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const details =
      await this.spvApplicationTransactionsService.createOrUpdateEscrowSetup(
        trustee.id,
        applicationId,
        {
          ...payload,
          isActive: true,
          isDeleted: false,
        },
      );

    return {
      success: true,
      message: 'Escrow setup updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-pre/escrow/{applicationId}')
  async fetchEscrowSetup(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const stepData = await this.spvApplicationService.fetchDataByStatusValue(
      trustee.id,
      applicationId,
      'escrow',
    );

    return {
      success: true,
      message: 'Escrow setup data',
      data: stepData,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-pre/documents/{applicationId}')
  async fetchDocuments(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const documents =
      await this.spvApplicationTransactionsService.fetchDocumentsByApplicationId(
        trustee.id,
        applicationId,
      );

    return {
      success: true,
      message: 'SPV documents',
      documents,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/isin-application/{applicationId}')
  async updateIsinApplication(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'depositoryId',
              'securityType',
              'isinNumber',
              'issueDate',
            ],
            properties: {
              depositoryId: {
                type: 'string',
                enum: ['nsdl', 'cdsl'],
              },
              securityType: {
                type: 'string',
                enum: ['secure', 'unsecure'],
              },
              isinNumber: {type: 'string'},
              issueSize: {type: 'string'},
              issueDate: {type: 'string', format: 'date-time'},
              creditRating: {type: 'string'},
              isinLetterDocId: {type: 'string'},
              isisnLetterDoc: {type: 'string'},
            },
          },
        },
      },
    })
    payload: Omit<
      IsinApplication,
      | 'id'
      | 'spvApplicationId'
      | 'isActive'
      | 'isDeleted'
      | 'createdAt'
      | 'updatedAt'
      | 'deletedAt'
    > & {
      isisnLetterDoc?: string | {id?: string};
    },
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const isinLetterDocId =
      payload.isinLetterDocId ??
      (typeof payload.isisnLetterDoc === 'string'
        ? payload.isisnLetterDoc
        : payload.isisnLetterDoc?.id);
    const details =
      await this.spvApplicationTransactionsService.createOrUpdateIsinApplication(
        trustee.id,
        applicationId,
        {
          depositoryId: payload.depositoryId,
          securityType: payload.securityType,
          isinNumber: payload.isinNumber,
          issueSize: payload.issueSize,
          issueDate: payload.issueDate,
          creditRating: payload.creditRating,
          isinLetterDocId,
        },
      );

    return {
      success: true,
      message: 'ISIN application updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-pre/isin-application/{applicationId}')
  async fetchIsinApplication(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const stepData = await this.spvApplicationService.fetchDataByStatusValue(
      trustee.id,
      applicationId,
      'isin_application',
    );

    return {
      success: true,
      message: 'ISIN application data',
      data: stepData,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/documents/{applicationId}/{documentId}')
  async updateDocument(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
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
    const trustee = await this.verifyTrustee(currentUser.id);
    const details = await this.spvApplicationTransactionsService.updateDocumentById(
      trustee.id,
      applicationId,
      documentId,
      payload,
    );

    return {
      success: true,
      message: 'SPV document updated',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/spv-pre/review-submit/{applicationId}')
  async submitReview(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('applicationId') applicationId: string,
  ) {
    const trustee = await this.verifyTrustee(currentUser.id);
    const details = await this.spvApplicationTransactionsService.submitReview(
      trustee.id,
      applicationId,
    );

    return {
      success: true,
      message: 'SPV review submitted',
      details,
    };
  }
}
