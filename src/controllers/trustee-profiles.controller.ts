import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, IsolationLevel, repository} from '@loopback/repository';
import {
  del,
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {
  AddressDetails,
  AuthorizeSignatories,
  BankDetails,
  TrusteeKycDocument,
  TrusteeProfiles,
} from '../models';
import {
  AddressDetailsRepository,
  AuthorizeSignatoriesRepository,
  BankDetailsRepository,
  KycApplicationsRepository,
  OtpRepository,
  RegistrationSessionsRepository,
  RolesRepository,
  TrusteeKycDocumentRepository,
  TrusteePanCardsRepository,
  TrusteeProfilesRepository,
  UserRolesRepository,
  UsersRepository,
} from '../repositories';
import {AddressDetailsService} from '../services/address-details.service';
import {BankDetailsService} from '../services/bank-details.service';
import {KycService} from '../services/kyc.service';
import {MediaService} from '../services/media.service';
import {SessionService} from '../services/session.service';
import {AuthorizeSignatoriesService} from '../services/signatories.service';
import {TrusteeKycDocumentService} from '../services/trustee-kyc-document.service';

export class TrusteeProfilesController {
  constructor(
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @repository(TrusteePanCardsRepository)
    private trusteePanCardsRepository: TrusteePanCardsRepository,
    @repository(TrusteeKycDocumentRepository)
    private trusteeKycDocumentRepository: TrusteeKycDocumentRepository,
    @repository(AddressDetailsRepository)
    private addressDetailsRepository: AddressDetailsRepository,
    @repository(BankDetailsRepository)
    private bankDetailsRepository: BankDetailsRepository,
    @repository(AuthorizeSignatoriesRepository)
    private authorizeSignatoriesRepository: AuthorizeSignatoriesRepository,
    @repository(UserRolesRepository)
    private userRolesRepository: UserRolesRepository,
    @repository(RolesRepository)
    private rolesRepository: RolesRepository,
    @repository(RegistrationSessionsRepository)
    private registrationSessionsRepository: RegistrationSessionsRepository,
    @repository(OtpRepository)
    private otpRepository: OtpRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @inject('service.trusteeKycDocumentService.service')
    private trusteeKycDocumentService: TrusteeKycDocumentService,
    @inject('service.bankDetails.service')
    private bankDetailsService: BankDetailsService,
    @inject('services.AuthorizeSignatoriesService.service')
    private authorizeSignatoriesService: AuthorizeSignatoriesService,
    @inject('service.session.service')
    private sessionService: SessionService,
    @inject('service.kyc.service')
    private kycService: KycService,
    @inject('service.media.service')
    private mediaService: MediaService,
    @inject('service.AddressDetails.service')
    private addressDetailsService: AddressDetailsService,
  ) {}

  // trustee flow will be like => Basic info, documents, bank details, authorize signatories, bank account details, agreement, verification.

  // fetch KYC application status...
  async getKycApplicationStatus(applicationId: string): Promise<string[]> {
    const kycApplication =
      await this.kycApplicationsRepository.findById(applicationId);

    return kycApplication.currentProgress ?? [];
  }

  // update KYC application status...
  async updateKycProgress(appId: string, step: string) {
    const kyc = await this.kycApplicationsRepository.findById(appId);

    const progress = Array.isArray(kyc.currentProgress)
      ? kyc.currentProgress
      : [];

    if (!progress.includes(step)) {
      progress.push(step);
      await this.kycApplicationsRepository.updateById(appId, {
        currentProgress: progress,
      });
    }

    return progress;
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @del('/trustee-profiles/{profileId}/purge')
  async purgeTrusteeProfile(
    @param.path.string('profileId') profileId: string,
  ): Promise<{
    success: boolean;
    message: string;
    profileId: string;
    userDeleted: boolean;
    deleted: {
      trusteeProfile: number;
      trusteePanCards: number;
      trusteeDocuments: number;
      addressDetails: number;
      bankDetails: number;
      signatories: number;
      kycApplications: number;
      trusteeUserRoles: number;
      registrationSessions: number;
      otpEntries: number;
    };
  }> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {
        isolationLevel: IsolationLevel.READ_COMMITTED,
      },
    );

    try {
      const trusteeProfile = await this.trusteeProfilesRepository.findOne(
        {
          where: {
            and: [{id: profileId}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!trusteeProfile) {
        throw new HttpErrors.NotFound('Trustee profile not found');
      }

      const trusteeUser = await this.usersRepository.findById(
        trusteeProfile.usersId,
        undefined,
        {transaction: tx},
      );

      const trusteePanCards = await this.trusteePanCardsRepository.find(
        {
          where: {
            trusteeProfilesId: trusteeProfile.id,
          },
        },
        {transaction: tx},
      );

      const trusteeDocuments = await this.trusteeKycDocumentRepository.find(
        {
          where: {
            usersId: trusteeProfile.usersId,
          },
        },
        {transaction: tx},
      );

      const addressDetails = await this.addressDetailsRepository.find(
        {
          where: {
            and: [
              {usersId: trusteeProfile.usersId},
              {identifierId: trusteeProfile.id},
              {roleValue: 'trustee'},
            ],
          },
        },
        {transaction: tx},
      );

      const bankDetails = await this.bankDetailsRepository.find(
        {
          where: {
            and: [{usersId: trusteeProfile.usersId}, {roleValue: 'trustee'}],
          },
        },
        {transaction: tx},
      );

      const signatories = await this.authorizeSignatoriesRepository.find(
        {
          where: {
            and: [
              {usersId: trusteeProfile.usersId},
              {identifierId: trusteeProfile.id},
              {roleValue: 'trustee'},
            ],
          },
        },
        {transaction: tx},
      );

      const mediaIds = Array.from(
        new Set(
          [
            trusteeProfile.trusteeLogoId,
            ...trusteePanCards.map(pan => pan.panCardDocumentId),
            ...trusteeDocuments.map(doc => doc.documentsFileId),
            ...addressDetails.map(address => address.addressProofId),
            ...bankDetails.map(bank => bank.bankAccountProofId),
            ...signatories.flatMap(signatory => [
              signatory.panCardFileId,
              signatory.boardResolutionFileId,
            ]),
          ].filter((id): id is string => !!id),
        ),
      );

      const deletedSignatories =
        await this.authorizeSignatoriesRepository.deleteAll(
          {
            usersId: trusteeProfile.usersId,
            identifierId: trusteeProfile.id,
            roleValue: 'trustee',
          },
          {transaction: tx},
        );

      const deletedBankDetails = await this.bankDetailsRepository.deleteAll(
        {
          usersId: trusteeProfile.usersId,
          roleValue: 'trustee',
        },
        {transaction: tx},
      );

      const deletedAddressDetails =
        await this.addressDetailsRepository.deleteAll(
          {
            identifierId: trusteeProfile.id,
            roleValue: 'trustee',
          },
          {transaction: tx},
        );

      const deletedTrusteeDocuments =
        await this.trusteeKycDocumentRepository.deleteAll(
          {
            usersId: trusteeProfile.usersId,
          },
          {transaction: tx},
        );

      const deletedTrusteePanCards =
        await this.trusteePanCardsRepository.deleteAll(
          {
            trusteeProfilesId: trusteeProfile.id,
          },
          {transaction: tx},
        );

      const deletedKycApplications =
        await this.kycApplicationsRepository.deleteAll(
          {
            usersId: trusteeProfile.usersId,
            identifierId: trusteeProfile.id,
            roleValue: 'trustee',
          },
          {transaction: tx},
        );

      const trusteeRole = await this.rolesRepository.findOne(
        {
          where: {value: 'trustee', isDeleted: false},
        },
        {transaction: tx},
      );

      const deletedTrusteeUserRoles = trusteeRole
        ? await this.userRolesRepository.deleteAll(
            {
              usersId: trusteeProfile.usersId,
              rolesId: trusteeRole.id,
            },
            {transaction: tx},
          )
        : {count: 0};

      const deletedRegistrationSessions =
        await this.registrationSessionsRepository.deleteAll(
          {
            and: [
              {roleValue: 'trustee'},
              {
                or: [
                  {email: trusteeUser.email},
                  {phoneNumber: trusteeUser.phone},
                ],
              },
            ],
          },
          {transaction: tx},
        );

      const deletedOtpEntries = await this.otpRepository.deleteAll(
        {
          or: [
            {identifier: trusteeUser.email},
            {identifier: trusteeUser.phone},
          ],
        },
        {transaction: tx},
      );

      const deletedTrusteeProfile =
        await this.trusteeProfilesRepository.deleteAll(
          {id: trusteeProfile.id},
          {transaction: tx},
        );

      const remainingUserRoles = await this.userRolesRepository.count(
        {
          usersId: trusteeProfile.usersId,
        },
        {transaction: tx},
      );

      const remainingKycApplications =
        await this.kycApplicationsRepository.count(
          {
            usersId: trusteeProfile.usersId,
          },
          {transaction: tx},
        );

      let userDeleted = false;

      if (
        remainingUserRoles.count === 0 &&
        remainingKycApplications.count === 0
      ) {
        await this.usersRepository.deleteById(trusteeProfile.usersId, {
          transaction: tx,
        });
        userDeleted = true;
      }

      await tx.commit();

      await this.mediaService.updateMediaUsedStatus(mediaIds, false);

      return {
        success: true,
        message: 'Trustee profile and related records deleted successfully',
        profileId,
        userDeleted,
        deleted: {
          trusteeProfile: deletedTrusteeProfile.count,
          trusteePanCards: deletedTrusteePanCards.count,
          trusteeDocuments: deletedTrusteeDocuments.count,
          addressDetails: deletedAddressDetails.count,
          bankDetails: deletedBankDetails.count,
          signatories: deletedSignatories.count,
          kycApplications: deletedKycApplications.count,
          trusteeUserRoles: deletedTrusteeUserRoles.count,
          registrationSessions: deletedRegistrationSessions.count,
          otpEntries: deletedOtpEntries.count,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // for trustees get current progress at start...
  @get('/trustee-profiles/kyc-progress/{sessionId}')
  async getTrusteeProfileKycProgress(
    @param.path.string('sessionId') sessionId: string,
  ): Promise<{
    success: boolean;
    message: string;
    currentProgress: string[];
    profile: TrusteeProfiles | null;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await this.sessionService.fetchProfile(sessionId);
    if (response.success && response?.profile?.id) {
      const trusteeProfile = await this.trusteeProfilesRepository.findOne({
        where: {
          and: [{usersId: response?.profile?.id}, {isDeleted: false}],
        },
        include: [
          {
            relation: 'trusteePanCards',
            scope: {
              include: [
                {
                  relation: 'panCardDocument',
                  scope: {
                    fields: {
                      fileUrl: true,
                      id: true,
                      fileOriginalName: true,
                      fileType: true,
                    },
                  },
                },
              ],
            },
          },
          {relation: 'trusteeEntityTypes'},
          {
            relation: 'users',
            scope: {fields: {id: true, phone: true, email: true}},
          },
          {
            relation: 'kycApplications',
            scope: {
              fields: {id: true, status: true, verifiedAt: true, reason: true},
            },
          },
        ],
      });

      if (!trusteeProfile) {
        return {
          success: true,
          message: 'New Profile',
          currentProgress: [],
          profile: null,
        };
      }

      const currentProgress = await this.getKycApplicationStatus(
        trusteeProfile.kycApplicationsId,
      );

      return {
        success: true,
        message: 'New Profile',
        currentProgress: currentProgress,
        profile: trusteeProfile,
      };
    }

    return {
      success: true,
      message: 'New Profile',
      currentProgress: [],
      profile: null,
    };
  }

  // fetch trustee info with stepper...
  @get('/trustee-profiles/kyc-get-data/{stepperId}/{usersId}')
  async getTrusteeProfileKycData(
    @param.path.string('stepperId') stepperId: string,
    @param.path.string('usersId') usersId: string,
    @param.query.string('route') route?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    const steppersAllowed = [
      'trustee_documents',
      'trustee_bank_details',
      'trustee_authorized_signatories',
    ];

    if (!steppersAllowed.includes(stepperId)) {
      throw new HttpErrors.BadRequest('Invalid stepper id');
    }

    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: usersId}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const currentProgress = await this.getKycApplicationStatus(
      trusteeProfile.kycApplicationsId,
    );

    if (
      !['trustee_kyc', 'pan_verified', 'trustee_documents'].includes(
        stepperId,
      ) &&
      !currentProgress.includes(stepperId)
    ) {
      throw new HttpErrors.BadRequest('Please complete the steps');
    }

    if (stepperId === 'trustee_kyc' || stepperId === 'pan_verified') {
      return {
        success: true,
        message: 'Trustee KYC data',
        data: trusteeProfile,
      };
    }

    if (stepperId === 'trustee_documents') {
      const documentsResponse =
        await this.trusteeKycDocumentService.fetchForKycStepper(usersId);

      return {
        success: true,
        message: 'Documents Data',
        data: documentsResponse.documents,
      };
    }

    if (stepperId === 'trustee_bank_details') {
      const bankDetailsResponse =
        await this.bankDetailsService.fetchUserBankAccounts(
          trusteeProfile.usersId,
          'trustee',
        );

      return {
        success: true,
        message: 'Bank accounts',
        data: bankDetailsResponse.accounts,
      };
    }

    if (stepperId === 'trustee_authorized_signatories') {
      const signatoriesResponse =
        await this.authorizeSignatoriesService.fetchAuthorizeSignatories(
          trusteeProfile.usersId,
          'trustee',
          trusteeProfile.id,
        );

      return {
        success: true,
        message: 'Authorize signatories',
        data: signatoriesResponse.signatories,
      };
    }

    return {
      success: false,
      message: 'No Step found',
      data: null,
    };
  }

  // for trustees but without login just for KYC
  @post('/trustee-profiles/kyc-upload-documents')
  async uploadTrusteeKYCDocuments(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'documents'],
            properties: {
              usersId: {type: 'string'},
              documents: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['documentsFileId'],
                  properties: {
                    trusteeKycDocumentRequirementsId: {type: 'string'},
                    documentsId: {type: 'string'},
                    documentsFileId: {type: 'string'},
                    mode: {type: 'number', enum: [0, 1]},
                    status: {type: 'number', enum: [0, 1, 2]},
                  },
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      documents: {
        trusteeKycDocumentRequirementsId?: string;
        documentsId?: string;
        documentsFileId: string;
        mode?: number;
        status?: number;
      }[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: TrusteeKycDocument[];
    currentProgress: string[];
  }> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const trustee = await this.trusteeProfilesRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!trustee) throw new HttpErrors.NotFound('Trustee not found');

      const newDocs = body.documents.map(doc => ({
        usersId: body.usersId,
        trusteeKycDocumentRequirementsId:
          doc.trusteeKycDocumentRequirementsId ?? doc.documentsId ?? '',
        documentsFileId: doc.documentsFileId,
        mode: doc.mode ?? 1,
        status: doc.status ?? 0,
        isActive: true,
        isDeleted: false,
      }));

      const invalidPayload = newDocs.find(
        doc => !doc.trusteeKycDocumentRequirementsId,
      );

      if (invalidPayload) {
        throw new HttpErrors.BadRequest(
          'trusteeKycDocumentRequirementsId is required for each document',
        );
      }

      const result = await this.trusteeKycDocumentService.uploadDocumentsForKyc(
        body.usersId,
        newDocs,
        tx,
      );

      const currentProgress = await this.updateKycProgress(
        trustee.kycApplicationsId,
        'trustee_documents',
      );

      await tx.commit();

      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // for trustees but without login just for KYC
  @post('/trustee-profiles/kyc-bank-details')
  async uploadTrusteeBankDetails(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'bankDetails'],
            properties: {
              usersId: {type: 'string'},
              bankDetails: {
                type: 'object',
                required: [
                  'bankName',
                  'bankShortCode',
                  'ifscCode',
                  'branchName',
                  'bankAddress',
                  'accountType',
                  'accountHolderName',
                  'accountNumber',
                  'bankAccountProofType',
                  'bankAccountProofId',
                ],
                properties: {
                  bankName: {type: 'string'},
                  bankShortCode: {type: 'string'},
                  ifscCode: {type: 'string'},
                  branchName: {type: 'string'},
                  bankAddress: {type: 'string'},
                  accountType: {type: 'number'},
                  accountHolderName: {type: 'string'},
                  accountNumber: {type: 'string'},
                  bankAccountProofType: {type: 'number'},
                  bankAccountProofId: {type: 'string'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      bankDetails: {
        bankName: string;
        bankShortCode: string;
        ifscCode: string;
        branchName: string;
        bankAddress: string;
        accountType: number;
        accountHolderName: string;
        accountNumber: string;
        bankAccountProofType: number;
        bankAccountProofId: string;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
    account: BankDetails;
    currentProgress: string[];
  }> {
    const trustee = await this.trusteeProfilesRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!trustee) throw new HttpErrors.NotFound('Trustee not found');

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: body.usersId,
      mode: 1,
      status: 0,
      roleValue: 'trustee',
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    const currentProgress = await this.updateKycProgress(
      trustee.kycApplicationsId,
      'trustee_bank_details',
    );

    return {...result, currentProgress};
  }

  // for trustees but without login just for KYC
  @post('/trustee-profiles/kyc-authorize-signatories')
  async uploadAuthorizeSignatories(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'signatories'],
            properties: {
              usersId: {type: 'string'},
              signatories: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'fullName',
                    'email',
                    'phone',
                    'submittedPanFullName',
                    'submittedPanNumber',
                    'submittedDateOfBirth',
                    'panCardFileId',
                    'boardResolutionFileId',
                    'designationType',
                    'designationValue',
                  ],
                  properties: {
                    fullName: {type: 'string'},
                    email: {type: 'string'},
                    phone: {type: 'string'},
                    extractedPanFullName: {type: 'string'},
                    extractedPanNumber: {type: 'string'},
                    extractedDateOfBirth: {type: 'string'},
                    submittedPanFullName: {type: 'string'},
                    submittedPanNumber: {type: 'string'},
                    submittedDateOfBirth: {type: 'string'},
                    panCardFileId: {type: 'string'},
                    boardResolutionFileId: {type: 'string'},
                    designationType: {type: 'string'},
                    designationValue: {type: 'string'},
                  },
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      signatories: Array<{
        fullName: string;
        email: string;
        phone: string;
        extractedPanFullName?: string;
        extractedPanNumber?: string;
        extractedDateOfBirth?: string;
        submittedPanFullName: string;
        submittedPanNumber: string;
        submittedDateOfBirth: string;
        panCardFileId: string;
        boardResolutionFileId: string;
        designationType: string;
        designationValue: string;
      }>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    createdAuthorizeSignatories: AuthorizeSignatories[];
    erroredAuthrizeSignatories: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }>;
    currentProgress: string[];
  }> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const trustee = await this.trusteeProfilesRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!trustee) throw new HttpErrors.NotFound('Trustee not found');

      const signatoriesData = body.signatories.map(
        s =>
          new AuthorizeSignatories({
            ...s,
            usersId: body.usersId,
            roleValue: 'trustee',
            identifierId: trustee.id,
            isActive: true,
            isDeleted: false,
          }),
      );

      const result =
        await this.authorizeSignatoriesService.createAuthorizeSignatories(
          signatoriesData,
          tx,
        );

      let currentProgress = await this.getKycApplicationStatus(
        trustee.kycApplicationsId,
      );

      if (result.createdAuthorizeSignatories.length > 0) {
        currentProgress = await this.updateKycProgress(
          trustee.kycApplicationsId,
          'trustee_authorized_signatories',
        );
      }

      await tx.commit();
      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // for trustees but without login just for KYC
  @post('/trustee-profiles/kyc-authorize-signatory')
  async uploadAuthorizeSignatory(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'signatory'],
            properties: {
              usersId: {type: 'string'},
              signatory: {
                type: 'object',
                required: [
                  'fullName',
                  'email',
                  'phone',
                  'submittedPanFullName',
                  'submittedPanNumber',
                  'submittedDateOfBirth',
                  'panCardFileId',
                  'boardResolutionFileId',
                  'designationType',
                  'designationValue',
                ],
                properties: {
                  fullName: {type: 'string'},
                  email: {type: 'string'},
                  phone: {type: 'string'},
                  extractedPanFullName: {type: 'string'},
                  extractedPanNumber: {type: 'string'},
                  extractedDateOfBirth: {type: 'string'},
                  submittedPanFullName: {type: 'string'},
                  submittedPanNumber: {type: 'string'},
                  submittedDateOfBirth: {type: 'string'},
                  panCardFileId: {type: 'string'},
                  boardResolutionFileId: {type: 'string'},
                  designationType: {type: 'string'},
                  designationValue: {type: 'string'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      signatory: {
        fullName: string;
        email: string;
        phone: string;
        extractedPanFullName?: string;
        extractedPanNumber?: string;
        extractedDateOfBirth?: string;
        submittedPanFullName: string;
        submittedPanNumber: string;
        submittedDateOfBirth: string;
        panCardFileId: string;
        boardResolutionFileId: string;
        designationType: string;
        designationValue: string;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
    currentProgress: string[];
  }> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const trustee = await this.trusteeProfilesRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!trustee) throw new HttpErrors.NotFound('Trustee not found');

      const signatoriesData = new AuthorizeSignatories({
        ...body.signatory,
        usersId: body.usersId,
        roleValue: 'trustee',
        identifierId: trustee.id,
        isActive: true,
        isDeleted: false,
      });

      const result =
        await this.authorizeSignatoriesService.createAuthorizeSignatory(
          signatoriesData,
        );

      const currentProgress = await this.updateKycProgress(
        trustee.kycApplicationsId,
        'trustee_authorized_signatories',
      );

      await tx.commit();
      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // get my trustee profile..
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/trustee-profiles/me')
  async getMyCompanyProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean; message: string; profile: TrusteeProfiles}> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
      include: [
        {
          relation: 'trusteePanCards',
          scope: {
            include: [
              {
                relation: 'panCardDocument',
                scope: {
                  fields: {
                    fileUrl: true,
                    id: true,
                    fileOriginalName: true,
                    fileType: true,
                  },
                },
              },
            ],
          },
        },
        {
          relation: 'users',
          scope: {fields: {id: true, phone: true, email: true}},
        },
        {relation: 'trusteeEntityTypes'},
        {
          relation: 'trusteeLogo',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('No trustee profile found');
    }

    return {
      success: true,
      message: 'Company Profile data',
      profile: trusteeProfile,
    };
  }

  private async countTrusteeByStatus(status: number) {
    const kycIds = (
      await this.kycApplicationsRepository.find({
        where: {isDeleted: false, status},
        fields: {id: true},
      })
    ).map(k => k.id);

    return (
      await this.trusteeProfilesRepository.count({
        isDeleted: false,
        kycApplicationsId: {inq: kycIds},
      })
    ).count;
  }

  // Get trustee profiles...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles')
  async getTrusteeProfiles(
    @param.filter(TrusteeProfiles) filter?: Filter<TrusteeProfiles>,
    @param.query.number('status') status?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: TrusteeProfiles[];
    count: {
      totalCount: number;
      totalRejected: number;
      totalPending: number;
      totalVerified: number;
      totalUnderReview: number;
    };
  }> {
    let rootWhere = {
      ...filter?.where,
    };

    if (status !== undefined && status !== null) {
      const filteredProfiles = await this.kycService.handleKycApplicationFilter(
        status,
        'trustee',
      );

      rootWhere = {
        ...filter?.where,
        id: {inq: filteredProfiles.profileIds},
      };
    }

    const trustees = await this.trusteeProfilesRepository.find({
      ...filter,
      where: rootWhere,
      order: filter?.order ?? ['createdAt DESC'],
      limit: filter?.limit ?? 10,
      skip: filter?.skip ?? 0,
      include: [
        {
          relation: 'users',
          scope: {fields: {id: true, phone: true, email: true}},
        },
        {
          relation: 'kycApplications',
          scope: {fields: {id: true, usersId: true, status: true, mode: true}},
        },
        {relation: 'trusteeEntityTypes'},
        {
          relation: 'trusteeLogo',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    const totalCount = (
      await this.trusteeProfilesRepository.count(filter?.where)
    ).count;

    const totalPending = await this.countTrusteeByStatus(0);
    const totalUnderReview = await this.countTrusteeByStatus(1);
    const totalVerified = await this.countTrusteeByStatus(2);
    const totalRejected = await this.countTrusteeByStatus(3);

    return {
      success: true,
      message: 'Trustee Profiles',
      data: trustees,
      count: {
        totalCount: totalCount,
        totalPending: totalPending,
        totalRejected: totalRejected,
        totalUnderReview: totalUnderReview,
        totalVerified: totalVerified,
      },
    };
  }

  // Get trustee profiles by id...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{id}')
  async getCompanyProfile(
    @param.path.string('id') id: string,
    @param.filter(TrusteeProfiles) filter?: Filter<TrusteeProfiles>,
  ): Promise<{
    success: boolean;
    message: string;
    data: TrusteeProfiles;
  }> {
    const trustee = await this.trusteeProfilesRepository.findById(id, {
      ...filter,
      include: [
        {
          relation: 'users',
          scope: {fields: {id: true, phone: true, email: true}},
        },
        {relation: 'kycApplications'},
        {
          relation: 'trusteePanCards',
          scope: {
            include: [
              {
                relation: 'panCardDocument',
                scope: {
                  fields: {
                    fileUrl: true,
                    id: true,
                    fileOriginalName: true,
                    fileType: true,
                  },
                },
              },
            ],
          },
        },
        {relation: 'trusteeEntityTypes'},
        {
          relation: 'trusteeLogo',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    return {
      success: true,
      message: 'Trustee Profile',
      data: trustee,
    };
  }

  // for trustee bank details upload
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @post('/trustee-profiles/bank-details')
  async uploadBankDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['bankDetails'],
            properties: {
              bankDetails: {
                type: 'object',
                required: [
                  'bankName',
                  'bankShortCode',
                  'ifscCode',
                  'branchName',
                  'bankAddress',
                  'accountType',
                  'accountHolderName',
                  'accountNumber',
                  'bankAccountProofType',
                  'bankAccountProofId',
                ],
                properties: {
                  bankName: {type: 'string'},
                  bankShortCode: {type: 'string'},
                  ifscCode: {type: 'string'},
                  branchName: {type: 'string'},
                  bankAddress: {type: 'string'},
                  accountType: {type: 'number'},
                  accountHolderName: {type: 'string'},
                  accountNumber: {type: 'string'},
                  bankAccountProofType: {type: 'number'},
                  bankAccountProofId: {type: 'string'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      bankDetails: {
        bankName: string;
        bankShortCode: string;
        ifscCode: string;
        branchName: string;
        bankAddress: string;
        accountType: number;
        accountHolderName: string;
        accountNumber: string;
        bankAccountProofType: number;
        bankAccountProofId: string;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
    account: BankDetails;
  }> {
    const trustee = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!trustee) throw new HttpErrors.NotFound('Trustee not found');

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: trustee.usersId,
      mode: 1,
      status: 0,
      roleValue: 'trustee',
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    return result;
  }

  // fetch bank accounts...
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/trustee-profiles/bank-details')
  async fetchBankDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccounts(
        trusteeProfile.usersId,
        'trustee',
      );

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.accounts,
    };
  }

  // fetch bank account
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/trustee-profiles/bank-details/{accountId}')
  async fetchBankDetailsWithId(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails}> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccount(accountId);

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.account,
    };
  }

  // Update Bank account info for trustee...
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/trustee-profiles/bank-details/{accountId}')
  async updateBankDetailsWithId(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('accountId') accountId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BankDetails, {partial: true}),
        },
      },
    })
    accountData: Partial<BankDetails>,
  ): Promise<{success: boolean; message: string; account: BankDetails | null}> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );
    try {
      const trusteeProfile = await this.trusteeProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!trusteeProfile) {
        throw new HttpErrors.NotFound('Trustee not found');
      }

      const bankDetailsResponse =
        await this.bankDetailsService.updateBankAccountInfo(
          accountId,
          accountData,
          tx,
        );

      await tx.commit();

      return bankDetailsResponse;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // Change Primary Bank account for trustee...
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/trustee-profiles/bank-details/{accountId}/primary')
  async updatePrimaryBankAccount(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string}> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );
    try {
      const trusteeProfile = await this.trusteeProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!trusteeProfile) {
        throw new HttpErrors.NotFound('Trustee not found');
      }

      const bankDetailsResponse =
        await this.bankDetailsService.markAccountAsPrimaryAccount(
          accountId,
          tx,
        );

      await tx.commit();

      return bankDetailsResponse;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // for trustee authorize signatories upload
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @post('/trustee-profiles/authorize-signatory')
  async uploadTrusteeAuthorizeSignatory(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['signatory'],
            properties: {
              signatory: {
                type: 'object',
                required: [
                  'fullName',
                  'email',
                  'phone',
                  'submittedPanFullName',
                  'submittedPanNumber',
                  'submittedDateOfBirth',
                  'panCardFileId',
                  'boardResolutionFileId',
                  'designationType',
                  'designationValue',
                ],
                properties: {
                  fullName: {type: 'string'},
                  email: {type: 'string'},
                  phone: {type: 'string'},
                  extractedPanFullName: {type: 'string'},
                  extractedPanNumber: {type: 'string'},
                  extractedDateOfBirth: {type: 'string'},
                  submittedPanFullName: {type: 'string'},
                  submittedPanNumber: {type: 'string'},
                  submittedDateOfBirth: {type: 'string'},
                  panCardFileId: {type: 'string'},
                  boardResolutionFileId: {type: 'string'},
                  designationType: {type: 'string'},
                  designationValue: {type: 'string'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      signatory: {
        fullName: string;
        email: string;
        phone: string;
        extractedPanFullName?: string;
        extractedPanNumber?: string;
        extractedDateOfBirth?: string;
        submittedPanFullName: string;
        submittedPanNumber: string;
        submittedDateOfBirth: string;
        panCardFileId: string;
        boardResolutionFileId: string;
        designationType: string;
        designationValue: string;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
  }> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const trustee = await this.trusteeProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!trustee) throw new HttpErrors.NotFound('Trustee not found');

      const signatoriesData = new AuthorizeSignatories({
        ...body.signatory,
        usersId: trustee.usersId,
        roleValue: 'trustee',
        identifierId: trustee.id,
        isActive: true,
        isDeleted: false,
      });

      const result =
        await this.authorizeSignatoriesService.createAuthorizeSignatory(
          signatoriesData,
        );

      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // fetch authorize signatories...
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/trustee-profiles/authorize-signatory')
  async fetchAuthorizeSignatories(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.filter(AuthorizeSignatories) filter: Filter<AuthorizeSignatories>,
  ): Promise<{
    success: boolean;
    message: string;
    signatories: AuthorizeSignatories[];
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const signatoriesResponse =
      await this.authorizeSignatoriesService.fetchAuthorizeSignatories(
        trusteeProfile.usersId,
        'trustee',
        trusteeProfile.id,
        filter,
      );

    return {
      success: true,
      message: 'Authorize signatories',
      signatories: signatoriesResponse.signatories,
    };
  }

  // fetch authorize signatory
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/trustee-profiles/authorize-signatory/{signatoryId}')
  async fetchAuthorizeSignatory(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('signatoryId') signatoryId: string,
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const signatoriesResponse =
      await this.authorizeSignatoriesService.fetchAuthorizeSignatory(
        signatoryId,
      );

    return {
      success: true,
      message: 'Authorize signatory data',
      signatory: signatoriesResponse.signatory,
    };
  }

  // Update Authorize signatory info for trustee...
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @patch('/trustee-profiles/authorize-signatory/{signatoryId}')
  async updateAuthorizeSignatoryWithId(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('signatoryId') signatoryId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(AuthorizeSignatories, {partial: true}),
        },
      },
    })
    signatoryData: Partial<AuthorizeSignatories>,
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories | null;
  }> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );
    try {
      const trusteeProfile = await this.trusteeProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!trusteeProfile) {
        throw new HttpErrors.NotFound('Trustee not found');
      }

      const signatoryResponse =
        await this.authorizeSignatoriesService.updateSignatoryInfo(
          signatoryId,
          signatoryData,
          tx,
        );

      await tx.commit();

      return signatoryResponse;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // create or update address details API...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/trustee-profiles/address-details')
  async addressDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['registeredAddress', 'correspondenceAddress'],
            properties: {
              registeredAddress: getModelSchemaRef(AddressDetails, {
                partial: true,
              }),
              correspondenceAddress: getModelSchemaRef(AddressDetails, {
                partial: true,
              }),
            },
          },
        },
      },
    })
    addressDetails: {
      registeredAddress: Partial<AddressDetails>;
      correspondenceAddress?: Partial<AddressDetails>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const {registeredAddress, correspondenceAddress} = addressDetails;

    const addressDetailsArray: Partial<AddressDetails>[] = [
      {
        ...registeredAddress,
        mode: 1,
        status: 0,
        usersId: currentUser.id,
        identifierId: trusteeProfile.id,
        roleValue: 'trustee',
      },
    ];

    if (correspondenceAddress) {
      addressDetailsArray.push({
        ...correspondenceAddress,
        mode: 1,
        status: 0,
        usersId: currentUser.id,
        identifierId: trusteeProfile.id,
        roleValue: 'trustee',
      });
    }

    const response =
      await this.addressDetailsService.createOrUpdateAddressDetails(
        addressDetailsArray,
      );

    return response;
  }

  // fetch trustee address details...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/trustee-profiles/address-details')
  async fetchAddressDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const response = await this.addressDetailsService.fetchUserAddressDetails(
      currentUser.id,
      'trustee',
      trusteeProfile.id,
    );

    return response;
  }

  // fetch documents
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/trustee-profiles/documents')
  async fetchDocuments(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    documents: TrusteeKycDocument[];
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const documentsResponse = await this.trusteeKycDocumentService.fetchByUser(
      trusteeProfile.usersId,
    );

    return {
      success: true,
      message: 'Documents data',
      documents: documentsResponse.documents,
    };
  }

  // fetch document...
  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/trustee-profiles/documents/{documentId}')
  async fetchDocument(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('documentId') documentId: string,
  ): Promise<{
    success: boolean;
    message: string;
    document: TrusteeKycDocument;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const documentsResponse =
      await this.trusteeKycDocumentService.fetchById(documentId);

    return {
      success: true,
      message: 'Authorize signatory data',
      document: documentsResponse.document,
    };
  }
}
