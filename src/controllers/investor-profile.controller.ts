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
import {AddressDetails, AuthorizeSignatories, BankDetails, ComplianceAndDeclarations, InvestmentMandate, InvestorKycDocument, InvestorProfile, PlatformAgreement, UboDetails} from '../models';
import {
  AddressDetailsRepository,
  AuthorizeSignatoriesRepository,
  BankDetailsRepository,
  ComplianceAndDeclarationsRepository,
  InvestmentMandateRepository,
  InvestorKycDocumentRepository,
  InvestorPanCardsRepository,
  InvestorProfileRepository,
  KycApplicationsRepository,
  OtpRepository,
  PlatformAgreementRepository,
  RegistrationSessionsRepository,
  RolesRepository,
  UboDetailsRepository,
  UserRolesRepository,
  UsersRepository,
} from '../repositories';
import {AddressDetailsService} from '../services/address-details.service';
import {BankDetailsService} from '../services/bank-details.service';
import {ComplianceAndDeclarationsService} from '../services/compliance-and-declarations.service';
import {InvestmentMandateService} from '../services/investment-mandate.service';
import {InvestorKycDocumentService} from '../services/investor-kyc-document.service';
import {KycService} from '../services/kyc.service';
import {MediaService} from '../services/media.service';
import {PlatformAgreementService} from '../services/platform-agreement.service';
import {SessionService} from '../services/session.service';
import {AuthorizeSignatoriesService} from '../services/signatories.service';
import {UboDetailsService} from '../services/ubo-details.service';

type InvestorKycFlowType = 'individual' | 'institutional';
type InvestorKycDataResponse = {
  success: boolean;
  message: string;
  data: any;
  investorType?: {
    id: string;
    label: string;
    value: string;
  } | null;
};

export class InvestorProfileController {
  constructor(
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(InvestorPanCardsRepository)
    private investorPanCardsRepository: InvestorPanCardsRepository,
    @repository(InvestorKycDocumentRepository)
    private investorKycDocumentRepository: InvestorKycDocumentRepository,
    @repository(AddressDetailsRepository)
    private addressDetailsRepository: AddressDetailsRepository,
    @repository(BankDetailsRepository)
    private bankDetailsRepository: BankDetailsRepository,
    @repository(UboDetailsRepository)
    private uboDetailsRepository: UboDetailsRepository,
    @repository(AuthorizeSignatoriesRepository)
    private authorizeSignatoriesRepository: AuthorizeSignatoriesRepository,
    @repository(ComplianceAndDeclarationsRepository)
    private complianceAndDeclarationsRepository: ComplianceAndDeclarationsRepository,
    @repository(InvestmentMandateRepository)
    private investmentMandateRepository: InvestmentMandateRepository,
    @repository(PlatformAgreementRepository)
    private platformAgreementRepository: PlatformAgreementRepository,
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
    @inject('service.kyc.service')
    private kycService: KycService,
    @inject('service.session.service')
    private sessionService: SessionService,
    @inject('service.bankDetails.service')
    private bankDetailsService: BankDetailsService,
    @inject('service.investorKycDocumentService.service')
    private investorKycDocumentService: InvestorKycDocumentService,
    @inject('service.AddressDetails.service')
    private addressDetailsService: AddressDetailsService,
    @inject('service.uboDetailsService.service')
    private uboDetailsService: UboDetailsService,
    @inject('services.AuthorizeSignatoriesService.service')
    private authorizeSignatoriesService: AuthorizeSignatoriesService,
    @inject('service.complianceAndDeclarationsService.service')
    private complianceAndDeclarationsService: ComplianceAndDeclarationsService,
    @inject('service.investmentMandateService.service')
    private investmentMandateService: InvestmentMandateService,
    @inject('service.platformAgreementService.service')
    private platformAgreementService: PlatformAgreementService,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) { }

  private getInvestorStepperConfig(investorKycType?: string): {
    flowType: InvestorKycFlowType;
    steps: string[];
    stepAliases: Record<string, string[]>;
  } {
    const flowType: InvestorKycFlowType =
      investorKycType === 'institutional' ? 'institutional' : 'individual';

    if (flowType === 'institutional') {
      return {
        flowType,
        steps: [
          'investor_documents',
          'kyc_address_details',
          'kyc_ubo_details',
          'kyc_signatories',
          'kyc_compliance_declarations',
          'investor_bank_details',
          'kyc_investment_mandate',
          'kyc_agreement',
          'kyc_review'
        ],
        stepAliases: {
          investor_documents: [
            'investor_documents',
            'investor_basic_info',
            'pan_verified',
          ],
          kyc_address_details: ['kyc_address_details'],
          kyc_ubo_details: ['kyc_ubo_details'],
          kyc_signatories: ['kyc_signatories'],
          kyc_compliance_declarations: ['kyc_compliance_declarations'],
          investor_bank_details: ['investor_bank_details'],
          kyc_investment_mandate: ['kyc_investment_mandate'],
          kyc_agreement: ['kyc_agreement'],
          kyc_review: ['kyc_review'],
        }
      };
    }

    return {
      flowType,
      steps: ['investor_kyc', 'investor_bank_details'],
      stepAliases: {
        investor_kyc: ['investor_kyc', 'investor_basic_info'],
        investor_bank_details: ['investor_bank_details'],
      },
    };
  }

  private normalizeInvestorProgress(
    currentProgress: string[],
    investorKycType?: string,
  ): string[] {
    const {steps, stepAliases} = this.getInvestorStepperConfig(investorKycType);

    return steps.filter(step =>
      (stepAliases[step] ?? [step]).some(alias => currentProgress.includes(alias)),
    );
  }

  private canAccessInvestorStep(
    stepperId: string,
    currentProgress: string[],
    investorKycType?: string,
  ): boolean {
    const {stepAliases} = this.getInvestorStepperConfig(investorKycType);

    return (stepAliases[stepperId] ?? [stepperId]).some(step =>
      currentProgress.includes(step),
    );
  }

  // fetch KYC application status...
  async getKycApplicationStatus(
    applicationId: string
  ): Promise<string[]> {
    const kycApplication = await this.kycApplicationsRepository.findById(applicationId);

    return kycApplication.currentProgress ?? [];
  }

  // update KYC application status...
  async updateKycProgress(appId: string, step: string) {
    const kyc = await this.kycApplicationsRepository.findById(appId);

    const progress = Array.isArray(kyc.currentProgress) ? kyc.currentProgress : [];

    if (!progress.includes(step)) {
      progress.push(step);
      await this.kycApplicationsRepository.updateById(appId, {currentProgress: progress});
    }

    return progress;
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @del('/investor-profiles/{profileId}/purge')
  async purgeInstitutionalInvestorProfile(
    @param.path.string('profileId') profileId: string,
  ): Promise<{
    success: boolean;
    message: string;
    profileId: string;
    userDeleted: boolean;
    deleted: {
      investorProfile: number;
      investorPanCards: number;
      investorDocuments: number;
      addressDetails: number;
      bankDetails: number;
      uboDetails: number;
      signatories: number;
      complianceDeclarations: number;
      investmentMandates: number;
      platformAgreements: number;
      kycApplications: number;
      investorUserRoles: number;
      registrationSessions: number;
      otpEntries: number;
    };
  }> {
    const tx =
      await this.investorProfileRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const investorProfile = await this.investorProfileRepository.findOne(
        {
          where: {
            id: profileId,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      if (!investorProfile) {
        throw new HttpErrors.NotFound('Investor profile not found');
      }

      if (investorProfile.investorKycType !== 'institutional') {
        throw new HttpErrors.BadRequest(
          'Purge is only supported for institutional investor profiles',
        );
      }

      const investorUser = await this.usersRepository.findById(
        investorProfile.usersId,
        undefined,
        {transaction: tx},
      );

      const investorPanCards = await this.investorPanCardsRepository.find(
        {
          where: {investorProfileId: investorProfile.id},
        },
        {transaction: tx},
      );

      const investorDocuments = await this.investorKycDocumentRepository.find(
        {
          where: {usersId: investorProfile.usersId},
        },
        {transaction: tx},
      );

      const addressDetails = await this.addressDetailsRepository.find(
        {
          where: {
            and: [
              {identifierId: investorProfile.id},
              {roleValue: 'investor'},
              {usersId: investorProfile.usersId}
            ],
          },
        },
        {transaction: tx},
      );

      const bankDetails = await this.bankDetailsRepository.find(
        {
          where: {
            and: [
              {usersId: investorProfile.usersId},
              {roleValue: 'investor'},
            ],
          },
        },
        {transaction: tx},
      );

      const uboDetails = await this.uboDetailsRepository.find(
        {
          where: {
            and: [
              {usersId: investorProfile.usersId},
              {identifierId: investorProfile.id},
              {roleValue: 'investor'},
            ]

          },
        },
        {transaction: tx},
      );

      const signatories = await this.authorizeSignatoriesRepository.find(
        {
          where: {
            and: [
              {usersId: investorProfile.usersId},
              {identifierId: investorProfile.id},
              {roleValue: 'investor'},
            ]
          },
        },
        {transaction: tx},
      );

      const platformAgreements = await this.platformAgreementRepository.find(
        {
          where: {
            and: [
              {usersId: investorProfile.usersId},
              {identifierId: investorProfile.id},
              {roleValue: 'investor'},
            ]
          },
        },
        {transaction: tx},
      );

      const mediaIds = Array.from(
        new Set(
          [
            investorProfile.investorLogo,
            ...investorPanCards.map(pan => pan.panCardDocumentId),
            ...investorDocuments.map(doc => doc.documentsFileId),
            ...addressDetails.map(address => address.addressProofId),
            ...bankDetails.map(bank => bank.bankAccountProofId),
            ...uboDetails.map(ubo => ubo.panCardId),
            ...signatories.flatMap(signatory => [
              signatory.panCardFileId,
              signatory.boardResolutionFileId,
            ]),
            ...platformAgreements.map(agreement => agreement.mediaId),
          ].filter((id): id is string => !!id),
        ),
      );

      const deletedSignatories =
        await this.authorizeSignatoriesRepository.deleteAll(
          {
            and: [
              {usersId: investorProfile.usersId},
              {identifierId: investorProfile.id},
              {roleValue: 'investor'},
            ]
          },
          {transaction: tx},
        );

      const deletedComplianceDeclarations =
        await this.complianceAndDeclarationsRepository.deleteAll(
          {
            usersId: investorProfile.usersId,
            identifierId: investorProfile.id,
            roleValue: 'investor',
          },
          {transaction: tx},
        );

      const deletedInvestmentMandates =
        await this.investmentMandateRepository.deleteAll(
          {
            usersId: investorProfile.usersId,
            identifierId: investorProfile.id,
            roleValue: 'investor',
          },
          {transaction: tx},
        );

      const deletedPlatformAgreements =
        await this.platformAgreementRepository.deleteAll(
          {
            usersId: investorProfile.usersId,
            identifierId: investorProfile.id,
            roleValue: 'investor',
          },
          {transaction: tx},
        );

      const deletedUboDetails = await this.uboDetailsRepository.deleteAll(
        {
          usersId: investorProfile.usersId,
          identifierId: investorProfile.id,
          roleValue: 'investor',
        },
        {transaction: tx},
      );

      const deletedBankDetails = await this.bankDetailsRepository.deleteAll(
        {
          usersId: investorProfile.usersId,
          roleValue: 'investor',
        },
        {transaction: tx},
      );

      const deletedAddressDetails = await this.addressDetailsRepository.deleteAll(
        {
          identifierId: investorProfile.id,
          roleValue: 'investor',
        },
        {transaction: tx},
      );

      const deletedInvestorDocuments =
        await this.investorKycDocumentRepository.deleteAll(
          {
            usersId: investorProfile.usersId,
          },
          {transaction: tx},
        );

      const deletedInvestorPanCards =
        await this.investorPanCardsRepository.deleteAll(
          {
            investorProfileId: investorProfile.id,
          },
          {transaction: tx},
        );

      const deletedKycApplications =
        await this.kycApplicationsRepository.deleteAll(
          {
            usersId: investorProfile.usersId,
            identifierId: investorProfile.id,
            roleValue: 'investor',
          },
          {transaction: tx},
        );

      const investorRole = await this.rolesRepository.findOne(
        {
          where: {value: 'investor', isDeleted: false},
        },
        {transaction: tx},
      );

      const deletedInvestorUserRoles = investorRole
        ? await this.userRolesRepository.deleteAll(
          {
            usersId: investorProfile.usersId,
            rolesId: investorRole.id,
          },
          {transaction: tx},
        )
        : {count: 0};

      const deletedRegistrationSessions =
        await this.registrationSessionsRepository.deleteAll(
          {
            and: [
              {roleValue: 'investor'},
              {
                or: [
                  {email: investorUser.email},
                  {phoneNumber: investorUser.phone},
                ],
              },
            ],
          },
          {transaction: tx},
        );

      const deletedOtpEntries = await this.otpRepository.deleteAll(
        {
          or: [
            {identifier: investorUser.email},
            {identifier: investorUser.phone},
          ],
        },
        {transaction: tx},
      );

      const deletedInvestorProfile = await this.investorProfileRepository.deleteAll(
        {id: investorProfile.id},
        {transaction: tx},
      );

      const remainingUserRoles = await this.userRolesRepository.count(
        {
          usersId: investorProfile.usersId,
        },
        {transaction: tx},
      );

      const remainingKycApplications =
        await this.kycApplicationsRepository.count(
          {
            usersId: investorProfile.usersId,
          },
          {transaction: tx},
        );

      let userDeleted = false;

      if (remainingUserRoles.count === 0 && remainingKycApplications.count === 0) {
        await this.usersRepository.deleteById(investorProfile.usersId, {
          transaction: tx,
        });
        userDeleted = true;
      }

      await tx.commit();

      await this.mediaService.updateMediaUsedStatus(mediaIds, false);

      return {
        success: true,
        message:
          'Institutional investor profile and related records deleted successfully',
        profileId,
        userDeleted,
        deleted: {
          investorProfile: deletedInvestorProfile.count,
          investorPanCards: deletedInvestorPanCards.count,
          investorDocuments: deletedInvestorDocuments.count,
          addressDetails: deletedAddressDetails.count,
          bankDetails: deletedBankDetails.count,
          uboDetails: deletedUboDetails.count,
          signatories: deletedSignatories.count,
          complianceDeclarations: deletedComplianceDeclarations.count,
          investmentMandates: deletedInvestmentMandates.count,
          platformAgreements: deletedPlatformAgreements.count,
          kycApplications: deletedKycApplications.count,
          investorUserRoles: deletedInvestorUserRoles.count,
          registrationSessions: deletedRegistrationSessions.count,
          otpEntries: deletedOtpEntries.count,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
  

  private async validateInvestorReviewSubmission(investor: InvestorProfile) {
    const currentProgress = await this.getKycApplicationStatus(
      investor.kycApplicationsId,
    );
    const requiredSteps = [
      'investor_documents',
      'kyc_address_details',
      'kyc_ubo_details',
      'kyc_signatories',
      'kyc_compliance_declarations',
      'investor_bank_details',
      'kyc_investment_mandate',
      'kyc_agreement',
    ];

    const missingSteps = requiredSteps.filter(
      step =>
        !this.canAccessInvestorStep(
          step,
          currentProgress,
          investor.investorKycType,
        ),
    );

    if (missingSteps.length) {
      throw new HttpErrors.BadRequest(
        `Please complete the steps: ${missingSteps.join(', ')}`,
      );
    }

    const agreementResponse =
      await this.platformAgreementService.fetchUserPlatformAgreement(
        investor.usersId,
        'investor',
        investor.id,
      );

    if (!agreementResponse.platformAgreement?.isConsent) {
      throw new HttpErrors.BadRequest(
        'Please accept the platform agreement before submitting review',
      );
    }

    const investmentMandateResponse =
      await this.investmentMandateService.fetchUserInvestmentMandate(
        investor.usersId,
        'investor',
        investor.id,
      );

    if (!investmentMandateResponse.investmentMandate) {
      throw new HttpErrors.BadRequest(
        'Investment mandate is required before submitting review',
      );
    }

    const complianceResponse =
      await this.complianceAndDeclarationsService.fetchUserComplianceDeclaration(
        investor.usersId,
        'investor',
        investor.id,
      );

    if (!complianceResponse.complianceDeclaration) {
      throw new HttpErrors.BadRequest(
        'Compliance and declarations are required before submitting review',
      );
    }
  }

  // for investor get current progress at start...
  @get('/investor-profiles/kyc-progress/{sessionId}')
  async getInvestorProfileKycProgress(
    @param.path.string('sessionId') sessionId: string
  ): Promise<{success: boolean; message: string; currentProgress: string[]; profile: InvestorProfile | null}> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await this.sessionService.fetchProfile(sessionId);
    if (response.success && response?.profile?.id) {
      const investorProfile = await this.investorProfileRepository.findOne({
        where: {
          and: [
            {usersId: response?.profile?.id},
            {isDeleted: false},
          ]
        },
        include: [
          {relation: 'investorPanCards', scope: {include: [{relation: 'panCardDocument', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}]}},
          {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
          {relation: 'kycApplications', scope: {fields: {id: true, status: true, verifiedAt: true, reason: true}}},
          {relation: 'aadharFrontImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
          {relation: 'aadharBackImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
          {relation: 'selfie', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}
        ]
      });

      if (!investorProfile) {
        return {
          success: true,
          message: 'New Profile',
          currentProgress: [],
          profile: null
        }
      }

      const currentProgress = await this.getKycApplicationStatus(investorProfile.kycApplicationsId);
      const normalizedProgress = this.normalizeInvestorProgress(
        currentProgress,
        investorProfile.investorKycType,
      );

      return {
        success: true,
        message: 'New Profile',
        currentProgress: normalizedProgress,
        profile: investorProfile
      }
    }

    return {
      success: true,
      message: 'New Profile',
      currentProgress: [],
      profile: null
    }
  }

  // fetch investor info with stepper...
  @get('/investor-profiles/kyc-get-data/{stepperId}/{usersId}')
  async getInvestorProfileKycData(
    @param.path.string('stepperId') stepperId: string,
    @param.path.string('usersId') usersId: string,
    @param.query.string('route') route?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<InvestorKycDataResponse> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [
          {usersId: usersId},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'investorPanCards', scope: {include: [{relation: 'panCardDocument', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}]}},
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'kycApplications', scope: {fields: {id: true, status: true, verifiedAt: true, reason: true}}},
        {relation: 'aadharFrontImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {relation: 'aadharBackImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {relation: 'selfie', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {
          relation: 'investorType',
          scope: {
            fields: {
              id: true,
              label: true,
              value: true,
            },
          },
        },
      ]
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    const {steps} = this.getInvestorStepperConfig(investorProfile.investorKycType);

    if (!steps.includes(stepperId)) {
      throw new HttpErrors.BadRequest(
        `Invalid stepper id for ${investorProfile.investorKycType ?? 'individual'} investor flow`,
      );
    }

    const currentProgress = await this.getKycApplicationStatus(investorProfile.kycApplicationsId);

    console.log('Curent Progress', currentProgress)

    if (
      stepperId !== 'kyc_agreement' &&
      !this.canAccessInvestorStep(
        stepperId,
        currentProgress,
        investorProfile.investorKycType,
      )
    ) {
      throw new HttpErrors.BadRequest('Please complete the steps');
    }

    if (
      stepperId === 'investor_kyc' ||
      stepperId === 'investor_basic_info'
    ) {
      return {
        success: true,
        message: 'Documents Data',
        data: investorProfile
      }
    }
    if (stepperId === 'investor_documents') {
      const investorType = (
        investorProfile as InvestorProfile & {
          investorType?: {id: string; label: string; value: string};
        }
      ).investorType
        ? {
          id: (
            investorProfile as InvestorProfile & {
              investorType: {
                id: string;
                label: string;
                value: string;
              };
            }
          ).investorType.id,
          label: (
            investorProfile as InvestorProfile & {
              investorType: {
                id: string;
                label: string;
                value: string;
              };
            }
          ).investorType.label,
          value: (
            investorProfile as InvestorProfile & {
              investorType: {
                id: string;
                label: string;
                value: string;
              };
            }
          ).investorType.value,
        }
        : null;

      const documentsResponse =
        await this.investorKycDocumentService.fetchForKycStepper(usersId);

      return {
        success: true,
        message: 'Documents Data',
        data: documentsResponse.documents,
        investorType

      };
    }

    if (stepperId === 'kyc_address_details') {
      const addressResponse =
        await this.addressDetailsService.fetchUserAddressDetails(
          investorProfile.usersId,
          'investor',
          investorProfile.id,
        );

      return {
        success: true,
        message: 'Address details',
        data: addressResponse,
      };
    }

    if (stepperId === 'kyc_ubo_details') {
      const uboDetailsResponse =
        await this.uboDetailsService.fetchUboDetails(
          investorProfile.usersId,
          investorProfile.id,
          'investor'
        );

      return {
        success: true,
        message: 'UBO details',
        data: uboDetailsResponse.uboDetails,
      };
    }

    if (stepperId === 'kyc_signatories') {

      const signatoriesResponse =
        await this.authorizeSignatoriesService.fetchAuthorizeSignatories(
          investorProfile.usersId,
          'investor',
          investorProfile.id,
        );

      return {
        success: true,
        message: 'Authorize signatories',
        data: signatoriesResponse.signatories,
      };

    }

    if (stepperId === 'kyc_compliance_declarations') {
      const complianceDeclarationResponse =
        await this.complianceAndDeclarationsService.fetchUserComplianceDeclaration(
          investorProfile.usersId,
          'investor',
          investorProfile.id,
        );

      return {
        success: true,
        message: 'Compliance and declarations',
        data: complianceDeclarationResponse.complianceDeclaration,
      };
    }

    if (stepperId === 'investor_bank_details') {
      const bankDetailsResponse = await this.bankDetailsService.fetchUserBankAccounts(investorProfile.usersId, 'investor');

      return {
        success: true,
        message: 'Bank accounts',
        data: bankDetailsResponse.accounts
      }
    }

    if (stepperId === 'kyc_investment_mandate') {
      const investmentMandateResponse =
        await this.investmentMandateService.fetchUserInvestmentMandate(
          investorProfile.usersId,
          'investor',
          investorProfile.id,
        );

      return {
        success: true,
        message: 'Investment mandate',
        data: investmentMandateResponse.investmentMandate,
      };
    }

    if (stepperId === 'kyc_agreement') {
      const platformAgreementResponse =
        await this.platformAgreementService.fetchUserPlatformAgreement(
          investorProfile.usersId,
          'investor',
          investorProfile.id,
        );

      return {
        success: true,
        message: 'Platform agreement',
        data: platformAgreementResponse.platformAgreement,
      };
    }

    return {
      success: false,
      message: 'No Step found',
      data: null
    }
  }

  // for investor but without login just for KYC
  @post('/investor-profiles/kyc-bank-details')
  async uploadCompanyBankDetailsUpload(
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
                required: ['bankName', 'bankShortCode', 'ifscCode', 'branchName', 'bankAddress', 'accountType', 'accountHolderName', 'accountNumber', 'bankAccountProofType', 'bankAccountProofId'],
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
                  bankAccountProofId: {type: 'string'}
                }
              }
            }
          }
        }
      }
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
      }
    }
  ): Promise<{
    success: boolean;
    message: string;
    account: BankDetails;
    currentProgress: string[];
  }> {
    const investor = await this.investorProfileRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false}
    });

    if (!investor) throw new HttpErrors.NotFound("Investor not found");

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: body.usersId,
      mode: 1,
      status: 0,
      roleValue: 'investor'
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    const currentProgress = await this.updateKycProgress(investor.kycApplicationsId, "investor_bank_details");

    return {...result, currentProgress};
  }

  // get my investor profile..
  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor-profiles/me')
  async getMyInvestorProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile
  ): Promise<{success: boolean; message: string; profile: InvestorProfile}> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'investorPanCards', scope: {include: [{relation: 'panCardDocument', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}]}},
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'aadharFrontImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {relation: 'aadharBackImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {relation: 'selfie', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}
      ]
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('No investor profile found');
    }

    return {
      success: true,
      message: 'Investor Profile data',
      profile: investorProfile
    }
  }



  private async countInvestorByStatus(status: number) {
    const kycIds = (
      await this.kycApplicationsRepository.find({
        where: {isDeleted: false, status},
        fields: {id: true},
      })
    ).map(k => k.id);

    return (
      await this.investorProfileRepository.count({
        isDeleted: false,
        kycApplicationsId: {inq: kycIds},
      })
    ).count;
  }

  // Get investor profiles...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles')
  async getInvestorProfiles(
    @param.filter(InvestorProfile) filter?: Filter<InvestorProfile>,
    @param.query.number('status') status?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: InvestorProfile[];
    count: {
      totalCount: number;
      totalRejected: number;
      totalPending: number;
      totalVerified: number;
      totalUnderReview: number;
    }
  }> {
    let rootWhere = {
      ...filter?.where
    };

    if (status !== undefined && status !== null) {
      const filteredProfiles = await this.kycService.handleKycApplicationFilter(status, 'investor');

      rootWhere = {
        ...filter?.where,
        id: {inq: filteredProfiles.profileIds}
      }
    };

    const investors = await this.investorProfileRepository.find({
      ...filter,
      where: rootWhere,
      limit: filter?.limit ?? 10,
      skip: filter?.skip ?? 0,
      include: [
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'kycApplications', scope: {fields: {id: true, usersId: true, status: true, mode: true}}},
        {
          relation: 'investorType',
          scope: {fields: {id: true, label: true, value: true}},
        },
        {
          relation: 'media',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true, fileName: true, fileType: true}},
        },
      ]
    });

    const totalCount = (await this.investorProfileRepository.count(filter?.where)).count;

    const totalPending = await this.countInvestorByStatus(0);
    const totalUnderReview = await this.countInvestorByStatus(1);
    const totalVerified = await this.countInvestorByStatus(2);
    const totalRejected = await this.countInvestorByStatus(3);

    return {
      success: true,
      message: 'Investor Profiles',
      data: investors,
      count: {
        totalCount: totalCount,
        totalPending: totalPending,
        totalRejected: totalRejected,
        totalUnderReview: totalUnderReview,
        totalVerified: totalVerified,
      }
    }
  }

  // Get investor profiles by id...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{id}')
  async getInvestorProfile(
    @param.path.string('id') id: string,
    @param.filter(InvestorProfile) filter?: Filter<InvestorProfile>,
  ): Promise<{
    success: boolean;
    message: string;
    data: InvestorProfile;
  }> {
    const investor = await this.investorProfileRepository.findById(id, {
      ...filter,
      include: [
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'kycApplications'},
        {relation: 'investorPanCards', scope: {include: [{relation: 'panCardDocument', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}]}},
        {relation: 'aadharFrontImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {relation: 'aadharBackImage', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {relation: 'selfie', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}},
        {
          relation: 'investorType',
          scope: {fields: {id: true, label: true, value: true}},
        },
        {
          relation: 'media',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true, fileName: true, fileType: true}},
        },
      ]
    });

    return {
      success: true,
      message: 'Investor Profiles',
      data: investor
    }
  }

  // fetch bank account
  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor-profiles/bank-details')
  async fetchBankDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails | null}> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isDeleted: false}
        ]
      }
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    const bankAccountList = await this.bankDetailsService.fetchUserBankAccounts(investorProfile.usersId, 'investor');

    if (!bankAccountList || bankAccountList?.accounts?.length === 0) {
      return {
        success: true,
        message: 'Bank accounts',
        bankDetails: null
      }
    }
    const bankDetailsResponse = await this.bankDetailsService.fetchUserBankAccount(bankAccountList.accounts[0].id);

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.account
    }
  }

  // Update Bank account info for company...
  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @patch('/investor-profiles/bank-details/{accountId}')
  async updateBankDetailsWithId(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('accountId') accountId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BankDetails, {partial: true})
        }
      }
    })
    accountData: Partial<BankDetails>
  ): Promise<{success: boolean; message: string; account: BankDetails | null}> {
    const tx = await this.investorProfileRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});
    try {
      const investorProfile = await this.investorProfileRepository.findOne({
        where: {
          and: [
            {usersId: currentUser.id},
            {isDeleted: false}
          ]
        }
      }, {transaction: tx});

      if (!investorProfile) {
        throw new HttpErrors.NotFound('Investor not found');
      }

      const bankDetailsResponse = await this.bankDetailsService.updateBankAccountInfo(accountId, accountData, tx);

      await tx.commit();

      return bankDetailsResponse;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }


  // INVESTOR INSTITUTIONAL FLOWS API'S

  @post('/investor-profiles/kyc-upload-documents')
  async uploadInvestorKYCDocuments(
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
                    investorKycDocumentRequirementsId: {type: 'string'},
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
        investorKycDocumentRequirementsId?: string;
        documentsId?: string;
        documentsFileId: string;
        mode?: number;
        status?: number;
      }[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: InvestorKycDocument[];
    currentProgress: string[];
  }> {
    const tx =
      await this.investorProfileRepository.dataSource.beginTransaction({
        IsolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const investor = await this.investorProfileRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!investor) throw new HttpErrors.NotFound('Investor not found');

      const newDocs = body.documents.map(doc => ({
        usersId: body.usersId,
        investorKycDocumentRequirementsId:
          doc.investorKycDocumentRequirementsId ?? doc.documentsId ?? '',
        documentsFileId: doc.documentsFileId,
        mode: doc.mode ?? 1,
        status: doc.status ?? 0,
        isActive: true,
        isDeleted: false,
      }));

      const invalidPayload = newDocs.find(
        doc => !doc.investorKycDocumentRequirementsId
      );

      if (invalidPayload) {
        throw new HttpErrors.BadRequest(
          'investorKycDocumentRequirementsId is required for each document',
        );
      }

      const result =
        await this.investorKycDocumentService.uploadDocumentsForKyc(
          body.usersId,
          newDocs,
          tx,
        );

      const currentProgress = await this.updateKycProgress(
        investor.kycApplicationsId,
        'investor_documents',
      );

      await tx.commit();

      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @patch('/investor-profiles/kyc-upload-documents')
  async patchInvestorKYCDocuments(
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
                    investorKycDocumentRequirementsId: {type: 'string'},
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
        investorKycDocumentRequirementsId?: string;
        documentsId?: string;
        documentsFileId: string;
        mode?: number;
        status?: number;
      }[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: InvestorKycDocument[];
    currentProgress: string[];
  }> {
    return this.uploadInvestorKYCDocuments(body);
  }

  @post('/investor-profiles/kyc-address-details')
  async uploadInvestorKycAddressDetails(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'registeredAddress'],
            properties: {
              usersId: {type: 'string'},
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
    body: {
      usersId: string;
      registeredAddress: Partial<AddressDetails>;
      correspondenceAddress?: Partial<AddressDetails>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
    currentProgress: string[];
  }> {
    const investor = await this.investorProfileRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!investor) throw new HttpErrors.NotFound('Investor not found');

    const addressDetailsArray: Partial<AddressDetails>[] = [
      {
        ...body.registeredAddress,
        addressType: 'registered',
        mode: 1,
        status: 0,
        usersId: body.usersId,
        identifierId: investor.id,
        roleValue: 'investor',
      },
    ];

    if (body.correspondenceAddress) {
      addressDetailsArray.push({
        ...body.correspondenceAddress,
        addressType: 'correspondence',
        mode: 1,
        status: 0,
        usersId: body.usersId,
        identifierId: investor.id,
        roleValue: 'investor',
      });
    }

    const response =
      await this.addressDetailsService.createOrUpdateAddressDetails(
        addressDetailsArray,
      );

    const currentProgress = await this.updateKycProgress(
      investor.kycApplicationsId,
      'kyc_address_details',
    );

    return {...response, currentProgress};
  }

  @patch('/investor-profiles/kyc-address-details')
  async patchInvestorKycAddressDetails(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'registeredAddress'],
            properties: {
              usersId: {type: 'string'},
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
    body: {
      usersId: string;
      registeredAddress: Partial<AddressDetails>;
      correspondenceAddress?: Partial<AddressDetails>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
    currentProgress: string[];
  }> {
    return this.uploadInvestorKycAddressDetails(body);
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor-profiles/UBO-details')
  async fetchUboDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean, message: string, UboDetails: UboDetails[]}> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw HttpErrors.NotFound('Investor not found');
    }
    const uboDetailsResponse = await this.uboDetailsService.fetchUboDetails(
      investorProfile?.usersId,
      investorProfile?.id,
      'investor'
    );

    return {
      success: true,
      message: 'UBO Details',
      UboDetails: uboDetailsResponse.uboDetails
    }
  }

  @post('/investor-profiles/kyc-ubo-details')
  async uploadInvestorKycUboDetails(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'uboDetails'],
            properties: {
              usersId: {type: 'string'},
              uboDetails: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'fullName',
                    'email',
                    'phone',
                    'ownershipPercentage',
                    'designationType',
                    'designationValue',
                    'submittedPanNumber',
                    'submittedPanFullName',
                    'submittedDateOfBirth',
                    'panCardId',
                  ],
                  properties: {
                    fullName: {type: 'string'},
                    email: {type: 'string'},
                    phone: {type: 'string'},
                    ownershipPercentage: {type: 'number'},
                    designationType: {
                      type: 'string',
                      enum: ['dropdown', 'custom'],
                    },
                    designationValue: {type: 'string'},
                    submittedPanNumber: {type: 'string'},
                    submittedPanFullName: {type: 'string'},
                    submittedDateOfBirth: {type: 'string'},
                    extractedPanNumber: {type: 'string'},
                    extractedPanFullName: {type: 'string'},
                    extractedDateOfBirth: {type: 'string'},
                    panCardId: {type: 'string'},
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
      uboDetails: Array<{
        fullName: string;
        email: string;
        phone: string;
        ownershipPercentage: number;
        designationType: string;
        designationValue: string;
        submittedPanNumber: string;
        submittedPanFullName: string;
        submittedDateOfBirth: string;
        extractedPanNumber?: string;
        extractedPanFullName?: string;
        extractedDateOfBirth?: string;
        panCardId: string;
      }>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    createdUboDetails: UboDetails[];
    erroredUboDetails: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }>;
    currentProgress: string[];
  }> {
    const tx =
      await this.investorProfileRepository.dataSource.beginTransaction({
        IsolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const investor = await this.investorProfileRepository.findOne(
        {
          where: {usersId: body.usersId, isDeleted: false},
        },
        {transaction: tx},
      );

      if (!investor) {
        throw new HttpErrors.NotFound('Investor not found');
      }

      const uboDetailsData = body.uboDetails.map(
        uboDetail =>
          new UboDetails({
            ...uboDetail,
            usersId: body.usersId,
            roleValue: 'investor',
            identifierId: investor.id,
            mode: 1,
            status: 0,
            isActive: true,
            isDeleted: false,
          }),
      );

      const result =
        await this.uboDetailsService.createUboDetails(
          uboDetailsData,
          tx,
        );

      const currentProgress = await this.updateKycProgress(
        investor.kycApplicationsId,
        'kyc_ubo_details',
      );

      await tx.commit();

      return {
        success: result.success,
        message: result.message,
        createdUboDetails: result.createdUboDetails,
        erroredUboDetails: result.erroredUboDetails,
        currentProgress
      };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @patch('/investor-profiles/kyc-ubo-details')
  async patchInvestorKycUboDetails(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'uboId', 'uboDetail'],
            properties: {
              usersId: {type: 'string'},
              uboId: {type: 'string'},
              uboDetail: {type: 'object'},
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      uboId: string;
      uboDetail: Partial<UboDetails>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    uboDetail: UboDetails | null;
  }> {

    const tx =
      await this.investorProfileRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const result =
        await this.uboDetailsService.updateUboDetail(
          body.uboId,
          body.uboDetail,
          tx,
        );

      await tx.commit();

      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @post('/investor-profiles/kyc-authorize-signatory')
  async uploadAuthorizeSignatoryForKyc(
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
    const tx = await this.investorProfileRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const investor = await this.investorProfileRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!investor) throw new HttpErrors.NotFound('Investor not found');

      const signatoriesData = new AuthorizeSignatories({
        ...body.signatory,
        usersId: body.usersId,
        roleValue: 'investor',
        identifierId: investor.id,
        isActive: true,
        isDeleted: false,
      });

      const result =
        await this.authorizeSignatoriesService.createAuthorizeSignatory(
          signatoriesData,
        );

      const currentProgress = await this.updateKycProgress(
        investor.kycApplicationsId,
        'kyc_signatories',
      );

      await tx.commit();
      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // for investor but without login just for KYC
  @patch('/investor-profiles/kyc-authorize-signatory')
  async patchAuthorizeSignatoryForKyc(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'signatoryId', 'signatory'],
            properties: {
              usersId: {type: 'string'},
              signatoryId: {type: 'string'},
              signatory: {
                type: 'object',
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
      signatoryId: string;
      signatory: Partial<AuthorizeSignatories>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories | null;
    currentProgress: string[];
  }> {
    const tx = await this.investorProfileRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const investor = await this.investorProfileRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!investor) throw new HttpErrors.NotFound('Investor not found');

      const result = await this.authorizeSignatoriesService.updateSignatoryInfo(
        body.signatoryId,
        body.signatory,
        tx,
      );

      const currentProgress = await this.updateKycProgress(
        investor.kycApplicationsId,
        'kyc_signatories',
      );

      await tx.commit();
      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @post('/investor-profiles/kyc-compliance-declarations')
  async uploadInvestorKycComplianceDeclarations(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'complianceDeclaration'],
            properties: {
              usersId: {type: 'string'},
              complianceDeclaration: {
                type: 'object',
                required: [
                  'taxCountry',
                  'taxNumber',
                  'isPEP',
                  'investmentOnBehalf',
                  'crossBorderFlow',
                  'sourceOfFunds',
                  'riskDisclosureAccepted',
                  'suitabilityConfirmed',
                ],
                properties: {
                  taxCountry: {type: 'string'},
                  taxNumber: {type: 'string'},
                  isPEP: {type: 'boolean'},
                  investmentOnBehalf: {
                    type: 'string',
                    enum: ['OWN_FUNDS', 'THIRD_PARTY'],
                  },
                  crossBorderFlow: {
                    type: 'string',
                    enum: ['DOMESTIC', 'INTERNATIONAL'],
                  },
                  sourceOfFunds: {type: 'string'},
                  riskDisclosureAccepted: {type: 'boolean'},
                  suitabilityConfirmed: {type: 'boolean'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      complianceDeclaration: {
        taxCountry: string;
        taxNumber: string;
        isPEP: boolean;
        investmentOnBehalf: string;
        crossBorderFlow: string;
        sourceOfFunds: string;
        riskDisclosureAccepted: boolean;
        suitabilityConfirmed: boolean;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
    complianceDeclaration: ComplianceAndDeclarations;
    currentProgress: string[];
  }> {
    const investor = await this.investorProfileRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!investor) throw new HttpErrors.NotFound('Investor not found');

    const response =
      await this.complianceAndDeclarationsService.createOrUpdateComplianceDeclaration(
        new ComplianceAndDeclarations({
          ...body.complianceDeclaration,
          usersId: body.usersId,
          roleValue: 'investor',
          identifierId: investor.id,
          mode: 1,
          status: 1,
          isActive: true,
          isDeleted: false,
        }),
      );

    const currentProgress = await this.updateKycProgress(
      investor.kycApplicationsId,
      'kyc_compliance_declarations',
    );

    return {...response, currentProgress};
  }

  @patch('/investor-profiles/kyc-compliance-declarations')
  async patchInvestorKycComplianceDeclarations(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'complianceDeclaration'],
            properties: {
              usersId: {type: 'string'},
              complianceDeclaration: {
                type: 'object',
                properties: {
                  taxCountry: {type: 'string'},
                  taxNumber: {type: 'string'},
                  isPEP: {type: 'boolean'},
                  investmentOnBehalf: {
                    type: 'string',
                    enum: ['OWN_FUNDS', 'THIRD_PARTY'],
                  },
                  crossBorderFlow: {
                    type: 'string',
                    enum: ['DOMESTIC', 'INTERNATIONAL'],
                  },
                  sourceOfFunds: {type: 'string'},
                  riskDisclosureAccepted: {type: 'boolean'},
                  suitabilityConfirmed: {type: 'boolean'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      complianceDeclaration: Partial<ComplianceAndDeclarations>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    complianceDeclaration: ComplianceAndDeclarations;
    currentProgress: string[];
  }> {
    return this.uploadInvestorKycComplianceDeclarations({
      usersId: body.usersId,
      complianceDeclaration: body.complianceDeclaration as {
        taxCountry: string;
        taxNumber: string;
        isPEP: boolean;
        investmentOnBehalf: string;
        crossBorderFlow: string;
        sourceOfFunds: string;
        riskDisclosureAccepted: boolean;
        suitabilityConfirmed: boolean;
      },
    });
  }

  @post('/investor-profiles/kyc-bank-details')
  async uploadInvestorBankDetails(
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
    const investor = await this.investorProfileRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!investor) throw new HttpErrors.NotFound('Investor not found');

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: body.usersId,
      mode: 1,
      status: 0,
      roleValue: 'investor',
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    const currentProgress = await this.updateKycProgress(
      investor.kycApplicationsId,
      'investor_bank_details',
    );

    return {...result, currentProgress};
  }

  @patch('/investor-profiles/kyc-bank-details')
  async patchInvestorKycBankDetails(
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
    return this.uploadInvestorBankDetails(body);
  }

  @post('/investor-profiles/kyc-investment-mandate')
  async uploadInvestorKycInvestmentMandate(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'investmentMandate'],
            properties: {
              usersId: {type: 'string'},
              investmentMandate: {
                type: 'object',
                required: [
                  'minimumInvestmentAmount',
                  'maximumTotalExposure',
                  'minimumTenorDays',
                  'maximumTenorDays',
                  'preferredYield',
                  'autoReinvestOnMaturity',
                  'maxExposureSingleMerchant',
                  'maxExposureSingleBank',
                ],
                properties: {
                  minimumInvestmentAmount: {type: 'number'},
                  maximumTotalExposure: {type: 'number'},
                  minimumTenorDays: {type: 'number'},
                  maximumTenorDays: {type: 'number'},
                  preferredYield: {type: 'number'},
                  autoReinvestOnMaturity: {type: 'boolean'},
                  maxExposureSingleMerchant: {type: 'number'},
                  maxExposureSingleBank: {type: 'number'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      investmentMandate: {
        minimumInvestmentAmount: number;
        maximumTotalExposure: number;
        minimumTenorDays: number;
        maximumTenorDays: number;
        preferredYield: number;
        autoReinvestOnMaturity: boolean;
        maxExposureSingleMerchant: number;
        maxExposureSingleBank: number;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
    investmentMandate: InvestmentMandate;
    currentProgress: string[];
  }> {
    const investor = await this.investorProfileRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!investor) throw new HttpErrors.NotFound('Investor not found');

    const response =
      await this.investmentMandateService.createOrUpdateInvestmentMandate(
        new InvestmentMandate({
          ...body.investmentMandate,
          usersId: body.usersId,
          roleValue: 'investor',
          identifierId: investor.id,
          mode: 1,
          status: 1,
          isActive: true,
          isDeleted: false,
        }),
      );

    const currentProgress = await this.updateKycProgress(
      investor.kycApplicationsId,
      'kyc_investment_mandate',
    );

    return {...response, currentProgress};
  }

  @patch('/investor-profiles/kyc-investment-mandate')
  async patchInvestorKycInvestmentMandate(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'investmentMandate'],
            properties: {
              usersId: {type: 'string'},
              investmentMandate: {
                type: 'object',
                properties: {
                  minimumInvestmentAmount: {type: 'number'},
                  maximumTotalExposure: {type: 'number'},
                  minimumTenorDays: {type: 'number'},
                  maximumTenorDays: {type: 'number'},
                  preferredYield: {type: 'number'},
                  autoReinvestOnMaturity: {type: 'boolean'},
                  maxExposureSingleMerchant: {type: 'number'},
                  maxExposureSingleBank: {type: 'number'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      investmentMandate: Partial<InvestmentMandate>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    investmentMandate: InvestmentMandate;
    currentProgress: string[];
  }> {
    return this.uploadInvestorKycInvestmentMandate({
      usersId: body.usersId,
      investmentMandate: body.investmentMandate as {
        minimumInvestmentAmount: number;
        maximumTotalExposure: number;
        minimumTenorDays: number;
        maximumTenorDays: number;
        preferredYield: number;
        autoReinvestOnMaturity: boolean;
        maxExposureSingleMerchant: number;
        maxExposureSingleBank: number;
      },
    });
  }

  @post('/investor-profiles/kyc-platform-agreement')
  async uploadInvestorKycPlatformAgreement(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'platformAgreement'],
            properties: {
              usersId: {type: 'string'},
              platformAgreement: {
                type: 'object',
                required: ['businessKycDocumentTypeId', 'isConsent'],
                properties: {
                  businessKycDocumentTypeId: {type: 'string'},
                  isConsent: {type: 'boolean'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      platformAgreement: {
        businessKycDocumentTypeId: string;
        isConsent: boolean;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
    platformAgreement: PlatformAgreement;
    currentProgress: string[];
  }> {
    const investor = await this.investorProfileRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!investor) throw new HttpErrors.NotFound('Investor not found');

    const response =
      await this.platformAgreementService.createOrUpdatePlatformAgreement(
        new PlatformAgreement({
          ...body.platformAgreement,
          usersId: body.usersId,
          roleValue: 'investor',
          identifierId: investor.id,
          mode: 1,
          status: 1,
          isActive: true,
          isDeleted: false,
        }),
      );

    const currentProgress = await this.updateKycProgress(
      investor.kycApplicationsId,
      'kyc_agreement',
    );

    return {...response, currentProgress};
  }

  @patch('/investor-profiles/kyc-platform-agreement')
  async patchInvestorKycPlatformAgreement(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'platformAgreement'],
            properties: {
              usersId: {type: 'string'},
              platformAgreement: {
                type: 'object',
                properties: {
                  businessKycDocumentTypeId: {type: 'string'},
                  isConsent: {type: 'boolean'},
                },
              },
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      platformAgreement: Partial<PlatformAgreement>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    platformAgreement: PlatformAgreement;
    currentProgress: string[];
  }> {
    return this.uploadInvestorKycPlatformAgreement({
      usersId: body.usersId,
      platformAgreement: body.platformAgreement as {
        businessKycDocumentTypeId: string;
        isConsent: boolean;
      },
    });
  }

  @post('/investor-profiles/kyc-review-submit')
  async submitInvestorKycReview(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId'],
            properties: {
              usersId: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      usersId: string;
    },
  ): Promise<{
    success: boolean;
    message: string;
    currentProgress: string[];
  }> {
    const investor = await this.investorProfileRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!investor) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    await this.validateInvestorReviewSubmission(investor);

    const currentProgress = await this.updateKycProgress(
      investor.kycApplicationsId,
      'kyc_review',
    );

    await this.kycApplicationsRepository.updateById(investor.kycApplicationsId, {
      status: 1,
      reason: undefined,
      verifiedAt: undefined,
    });

    return {
      success: true,
      message: 'KYC submitted successfully',
      currentProgress,
    };
  }

}
