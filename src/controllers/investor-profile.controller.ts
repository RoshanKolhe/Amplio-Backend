import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, IsolationLevel, repository} from '@loopback/repository';
import {get, getModelSchemaRef, HttpErrors, param, patch, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {AddressDetails, BankDetails, InvestorKycDocument, InvestorProfile} from '../models';
import {InvestorProfileRepository, KycApplicationsRepository} from '../repositories';
import {AddressDetailsService} from '../services/address-details.service';
import {BankDetailsService} from '../services/bank-details.service';
import {InvestorKycDocumentService} from '../services/investor-kyc-document.service';
import {KycService} from '../services/kyc.service';
import {SessionService} from '../services/session.service';

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
          'kyc_bank_details',
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
          kyc_ubo_details: ['kyc_ubo_details', 'investor_ubo_details'],
          kyc_signatories: ['kyc_signatories'],
          kyc_compliance_declarations: ['kyc_compliance_declarations'],
          kyc_bank_details: ['kyc_bank_details', 'investor_bank_details'],
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

    if (!this.canAccessInvestorStep(stepperId, currentProgress, investorProfile.investorKycType)) {
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

    if (stepperId === 'investor_bank_details') {
      const bankDetailsResponse = await this.bankDetailsService.fetchUserBankAccounts(investorProfile.usersId, 'investor');

      return {
        success: true,
        message: 'Bank accounts',
        data: bankDetailsResponse.accounts
      }
    }

    if (stepperId === 'investor_ubo_details') {
      return {
        success: true,
        message: 'UBO details',
        data: []
      }
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
      ]
    });

    const totalCount = (await this.investorProfileRepository.count(filter?.where)).count;

    const totalPending = await this.countInvestorByStatus(0);
    const totalUnderReview = await this.countInvestorByStatus(1);
    const totalVerified = await this.countInvestorByStatus(2);
    const totalRejected = await this.countInvestorByStatus(3);

    return {
      success: true,
      message: 'Company Profiles',
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
        {relation: 'selfie', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}
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
  @authorize({roles: ['company']})
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

}
