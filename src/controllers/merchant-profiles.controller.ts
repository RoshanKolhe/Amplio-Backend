import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, IsolationLevel, repository} from '@loopback/repository';
import {
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
  BankDetails,
  MerchantKycDocument,
  MerchantProfiles,
  MerchantUboDetails,
  Psp,
} from '../models';
import {
  KycApplicationsRepository,
  MerchantProfilesRepository,
} from '../repositories';
import {AddressDetailsService} from '../services/address-details.service';
import {BankDetailsService} from '../services/bank-details.service';
import {KycService} from '../services/kyc.service';
import {MediaService} from '../services/media.service';
import {MerchantKycDocumentService} from '../services/merchant-kyc-document.service';
import {MerchantUboDetailsService} from '../services/merchant-ubo-details.service';
import {PspService} from '../services/psp.service';
import {SessionService} from '../services/session.service';

export class MerchantProfilesController {
  constructor(
    @repository(MerchantProfilesRepository)
    private merchantProfilesRepository: MerchantProfilesRepository,
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @inject('service.session.service')
    private sessionService: SessionService,
    @inject('service.merchantKycDocumentService.service')
    private merchantKycDocumentService: MerchantKycDocumentService,
    @inject('service.bankDetails.service')
    private bankDetailsService: BankDetailsService,
    @inject('service.AddressDetails.service')
    private addressDetailsService: AddressDetailsService,
    @inject('service.merchantUboDetailsService.service')
    private merchantUboDetailsService: MerchantUboDetailsService,
    @inject('service.pspService.service')
    private pspService: PspService,
    @inject('service.kyc.service')
    private kycService: KycService,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) { }

  async getKycApplicationStatus(applicationId: string): Promise<string[]> {
    const kycApplication =
      await this.kycApplicationsRepository.findById(applicationId);

    return kycApplication.currentProgress ?? [];
  }

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

  @get('/merchant-profiles/kyc-progress/{sessionId}')
  async getMerchantProfileKycProgress(
    @param.path.string('sessionId') sessionId: string,
  ): Promise<{
    success: boolean;
    message: string;
    currentProgress: string[];
    profile: MerchantProfiles | null;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await this.sessionService.fetchProfile(sessionId);

    if (response.success && response?.profile?.id) {
      const merchantProfile = await this.merchantProfilesRepository.findOne({
        where: {
          and: [{usersId: response.profile.id}, {isDeleted: false}],
        },
        include: [
          {
            relation: 'merchantPanCard',
            scope: {
              include: [
                {
                  relation: 'media',
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
          {relation: 'merchantDealershipType'},
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
          {
            relation: 'media',
            scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
          },
        ],
      });

      if (!merchantProfile) {
        return {
          success: true,
          message: 'New Profile',
          currentProgress: [],
          profile: null,
        };
      }

      const currentProgress = await this.getKycApplicationStatus(
        merchantProfile.kycApplicationsId,
      );

      return {
        success: true,
        message: 'New Profile',
        currentProgress,
        profile: merchantProfile,
      };
    }

    return {
      success: true,
      message: 'New Profile',
      currentProgress: [],
      profile: null,
    };
  }

  @get('/merchant-profiles/kyc-get-data/{stepperId}/{usersId}')
  async getMerchantProfileKycData(
    @param.path.string('stepperId') stepperId: string,
    @param.path.string('usersId') usersId: string,
  ): Promise<{
    success: boolean;
    message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    merchantDealershipType?: {
      id: string;
      label: string;
      value: string;
    } | null;
  }> {
    const steppersAllowed = [
      'merchant_kyc',
      'pan_verified',
      'merchant_documents',
      'merchant_address_details',
      'merchant_bank_details',
      'merchant_ubo_details',
      'merchant_psp_details',
    ];

    if (!steppersAllowed.includes(stepperId)) {
      throw new HttpErrors.BadRequest('Invalid stepper id');
    }

    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId}, {isDeleted: false}],
      },
      include: [
        {
          relation: 'merchantPanCard',
          scope: {
            include: [
              {
                relation: 'media',
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
          relation: 'merchantDealershipType',
          scope: {
            fields: {
              id: true,
              label: true,
              value: true,
            },
          },
        },
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
        {
          relation: 'media',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    const currentProgress = await this.getKycApplicationStatus(
      merchantProfile.kycApplicationsId,
    );

    if (
      !['merchant_kyc', 'pan_verified', 'merchant_documents'].includes(
        stepperId,
      ) &&
      !currentProgress.includes(stepperId)
    ) {
      throw new HttpErrors.BadRequest('Please complete the steps');
    }

    if (stepperId === 'merchant_kyc' || stepperId === 'pan_verified') {
      return {
        success: true,
        message: 'Merchant KYC data',
        data: merchantProfile,
      };
    }

    if (stepperId === 'merchant_documents') {
      const merchantDealershipType = (
        merchantProfile as MerchantProfiles & {
          merchantDealershipType?: {id: string; label: string; value: string};
        }
      ).merchantDealershipType
        ? {
          id: (
            merchantProfile as MerchantProfiles & {
              merchantDealershipType: {
                id: string;
                label: string;
                value: string;
              };
            }
          ).merchantDealershipType.id,
          label: (
            merchantProfile as MerchantProfiles & {
              merchantDealershipType: {
                id: string;
                label: string;
                value: string;
              };
            }
          ).merchantDealershipType.label,
          value: (
            merchantProfile as MerchantProfiles & {
              merchantDealershipType: {
                id: string;
                label: string;
                value: string;
              };
            }
          ).merchantDealershipType.value,
        }
        : null;

      const documentsResponse =
        await this.merchantKycDocumentService.fetchForKycStepper(usersId);

      return {
        success: true,
        message: 'Documents Data',
        data: documentsResponse.documents,
        merchantDealershipType,
      };
    }

    if (stepperId === 'merchant_address_details') {
      const addressResponse =
        await this.addressDetailsService.fetchUserAddressDetails(
          merchantProfile.usersId,
          'merchant',
          merchantProfile.id,
        );

      return {
        success: true,
        message: 'Address details',
        data: addressResponse,
      };
    }

    if (stepperId === 'merchant_bank_details') {
      const bankDetailsResponse =
        await this.bankDetailsService.fetchUserBankAccounts(
          merchantProfile.usersId,
          'merchant',
        );

      return {
        success: true,
        message: 'Bank accounts',
        data: bankDetailsResponse.accounts,
      };
    }

    if (stepperId === 'merchant_ubo_details') {
      const merchantUboDetailsResponse =
        await this.merchantUboDetailsService.fetchMerchantUboDetails(
          merchantProfile.usersId,
          merchantProfile.id,
        );

      return {
        success: true,
        message: 'Merchant UBO details',
        data: merchantUboDetailsResponse.uboDetails,
      };
    }

    if (stepperId === 'merchant_psp_details') {
      const pspData = await this.pspService.fetchMerchantPsp(
        merchantProfile.usersId,
        merchantProfile.id,
      );
      return {
        success: true,
        message: 'Merchant PSP data',
        data: pspData.psp,
      };
    }

    return {
      success: false,
      message: 'No Step found',
      data: null,
    };
  }

  @post('/merchant-profiles/kyc-upload-documents')
  async uploadMerchantKYCDocuments(
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
                    merchantKycDocumentRequirementsId: {type: 'string'},
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
        merchantKycDocumentRequirementsId?: string;
        documentsId?: string;
        documentsFileId: string;
        mode?: number;
        status?: number;
      }[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: MerchantKycDocument[];
    currentProgress: string[];
  }> {
    const tx =
      await this.merchantProfilesRepository.dataSource.beginTransaction({
        IsolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const merchant = await this.merchantProfilesRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!merchant) throw new HttpErrors.NotFound('Merchant not found');

      const newDocs = body.documents.map(doc => ({
        usersId: body.usersId,
        merchantKycDocumentRequirementsId:
          doc.merchantKycDocumentRequirementsId ?? doc.documentsId ?? '',
        documentsFileId: doc.documentsFileId,
        mode: doc.mode ?? 1,
        status: doc.status ?? 0,
        isActive: true,
        isDeleted: false,
      }));

      const invalidPayload = newDocs.find(
        doc => !doc.merchantKycDocumentRequirementsId,
      );

      if (invalidPayload) {
        throw new HttpErrors.BadRequest(
          'merchantKycDocumentRequirementsId is required for each document',
        );
      }

      const result =
        await this.merchantKycDocumentService.uploadDocumentsForKyc(
          body.usersId,
          newDocs,
          tx,
        );

      const currentProgress = await this.updateKycProgress(
        merchant.kycApplicationsId,
        'merchant_documents',
      );

      await tx.commit();

      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @patch('/merchant-profiles/kyc-upload-documents')
  async patchMerchantKYCDocuments(
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
                    merchantKycDocumentRequirementsId: {type: 'string'},
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
        merchantKycDocumentRequirementsId?: string;
        documentsId?: string;
        documentsFileId: string;
        mode?: number;
        status?: number;
      }[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: MerchantKycDocument[];
    currentProgress: string[];
  }> {
    return this.uploadMerchantKYCDocuments(body);
  }

  @post('/merchant-profiles/kyc-bank-details')
  async uploadMerchantBankDetails(
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
    const merchant = await this.merchantProfilesRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!merchant) throw new HttpErrors.NotFound('Merchant not found');

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: body.usersId,
      mode: 1,
      status: 0,
      roleValue: 'merchant',
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    const currentProgress = await this.updateKycProgress(
      merchant.kycApplicationsId,
      'merchant_bank_details',
    );

    return {...result, currentProgress};
  }

  @patch('/merchant-profiles/kyc-bank-details')
  async patchMerchantKycBankDetails(
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
    return this.uploadMerchantBankDetails(body);
  }

  @post('/merchant-profiles/kyc-ubo-details')
  async uploadMerchantKycUboDetails(
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
    createdMerchantUboDetails: MerchantUboDetails[];
    erroredMerchantUboDetails: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }>;
    currentProgress: string[];
  }> {
    const tx =
      await this.merchantProfilesRepository.dataSource.beginTransaction({
        IsolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const merchant = await this.merchantProfilesRepository.findOne(
        {
          where: {usersId: body.usersId, isDeleted: false},
        },
        {transaction: tx},
      );

      if (!merchant) {
        throw new HttpErrors.NotFound('Merchant not found');
      }

      const merchantUboDetailsData = body.uboDetails.map(
        uboDetail =>
          new MerchantUboDetails({
            ...uboDetail,
            usersId: body.usersId,
            roleValue: 'merchant',
            identifierId: merchant.id,
            mode: 1,
            status: 0,
            isActive: true,
            isDeleted: false,
          }),
      );

      const result =
        await this.merchantUboDetailsService.createMerchantUboDetails(
          merchantUboDetailsData,
          tx,
        );

      const currentProgress = await this.updateKycProgress(
        merchant.kycApplicationsId,
        'merchant_ubo_details',
      );

      await tx.commit();

      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @patch('/merchant-profiles/kyc-ubo-details')
  async patchMerchantKycUboDetails(
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
      uboDetail: Partial<MerchantUboDetails>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    uboDetail: MerchantUboDetails | null;
  }> {

    const tx =
      await this.merchantProfilesRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const result =
        await this.merchantUboDetailsService.updateMerchantUboDetail(
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

  @post('/merchant-profiles/kyc-psp')
  async createMerchantPsp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'psp'],
            properties: {
              usersId: {type: 'string'},
              psp: {type: 'object'},
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      psp: Partial<Psp>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    psp: Psp;
    currentProgress: string[];
  }> {
    const tx =
      await this.merchantProfilesRepository.dataSource.beginTransaction({
        IsolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const merchant = await this.merchantProfilesRepository.findOne(
        {
          where: {
            usersId: body.usersId,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      if (!merchant) {
        throw new HttpErrors.NotFound('Merchant not found');
      }

      const result = await this.pspService.upsertMerchantPsp(
        merchant.id,
        body.usersId,
        body.psp,
        undefined,
        tx,
      );

      const currentProgress = await this.updateKycProgress(
        merchant.kycApplicationsId,
        'merchant_psp_details',
      );

      await tx.commit();

      return {
        success: result.success,
        message: result.message,
        psp: result.psp,
        currentProgress,
      };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @patch('/merchant-profiles/kyc-psp')
  async updateMerchantPsp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['usersId', 'pspId', 'psp'],
            properties: {
              usersId: {type: 'string'},
              pspId: {type: 'string'},
              psp: {type: 'object'},
            },
          },
        },
      },
    })
    body: {
      usersId: string;
      pspId: string;
      psp: Partial<Psp>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    psp: Psp;
    currentProgress: string[];
  }> {
    const tx =
      await this.merchantProfilesRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const merchant = await this.merchantProfilesRepository.findOne(
        {
          where: {
            usersId: body.usersId,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      if (!merchant) {
        throw new HttpErrors.NotFound('Merchant not found');
      }

      const result = await this.pspService.upsertMerchantPsp(
        merchant.id,
        body.usersId,
        body.psp,
        body.pspId, // pass PSP ID for update
        tx,
      );

      const currentProgress = await this.updateKycProgress(
        merchant.kycApplicationsId,
        'merchant_psp_details',
      );

      await tx.commit();

      return {
        success: result.success,
        message: result.message,
        psp: result.psp,
        currentProgress,
      };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  @post('/merchant-profiles/kyc-address-details')
  async uploadMerchantKycAddressDetails(
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
    const merchant = await this.merchantProfilesRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!merchant) throw new HttpErrors.NotFound('Merchant not found');

    const addressDetailsArray: Partial<AddressDetails>[] = [
      {
        ...body.registeredAddress,
        addressType: 'registered',
        mode: 1,
        status: 0,
        usersId: body.usersId,
        identifierId: merchant.id,
        roleValue: 'merchant',
      },
    ];

    if (body.correspondenceAddress) {
      addressDetailsArray.push({
        ...body.correspondenceAddress,
        addressType: 'correspondence',
        mode: 1,
        status: 0,
        usersId: body.usersId,
        identifierId: merchant.id,
        roleValue: 'merchant',
      });
    }

    const response =
      await this.addressDetailsService.createOrUpdateAddressDetails(
        addressDetailsArray,
      );

    const currentProgress = await this.updateKycProgress(
      merchant.kycApplicationsId,
      'merchant_address_details',
    );

    return {...response, currentProgress};
  }

  @patch('/merchant-profiles/kyc-address-details')
  async patchMerchantKycAddressDetails(
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
    return this.uploadMerchantKycAddressDetails(body);
  }

  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/merchant-profiles/me')
  async getMyMerchantProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.filter(MerchantProfiles) filter?: Filter<MerchantProfiles>,
  ): Promise<{
    success: boolean;
    message: string;
    profile: MerchantProfiles;
  }> {
    const merchantProfile = await this.merchantProfilesRepository.findOne({
      ...filter,
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
      include: [
        {
          relation: 'merchantPanCard',
          scope: {
            include: [
              {
                relation: 'media',
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
        {relation: 'merchantDealershipType'},
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
        {
          relation: 'media',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('No merchant profile found');
    }

    return {
      success: true,
      message: 'Merchant Profile data',
      profile: merchantProfile,
    };
  }

  /////------Merchant profiles get-----//////
  private async countByStatus(status: number) {
    const kycIds = (
      await this.kycApplicationsRepository.find({
        where: {isDeleted: false, status},
        fields: {id: true},
      })
    ).map(k => k.id);

    return (
      await this.merchantProfilesRepository.count({
        isDeleted: false,
        kycApplicationsId: {inq: kycIds},
      })
    ).count;
  }


  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/merchant-profiles')
  async getMerchantProfiles(
    @param.filter(MerchantProfiles) filter?: Filter<MerchantProfiles>,
    @param.query.number('status') status?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: MerchantProfiles[];
    count: {
      totalCount: number;
      totalRejected: number;
      totalPending: number;
      totalVerified: number;
      totalUnderReview: number;
    }
  }> {
    let rootWhere = {
      ...filter?.where,
    };

    if (status !== undefined && status !== null) {
      const filteredProfiles = await this.kycService.handleKycApplicationFilter(
        status,
        'merchant',
      );

      rootWhere = {
        ...filter?.where,
        id: {inq: filteredProfiles.profileIds},
      };
    }

    const merchant = await this.merchantProfilesRepository.find({
      ...filter,
      where: rootWhere,
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
        {relation: 'merchantDealershipType'},
        {
          relation: 'media',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
      order: filter?.order ?? ['createdAt DESC'],

    });

    const totalCount = (await this.merchantProfilesRepository.count(filter?.where)).count;
    const totalPending = await this.countByStatus(0);
    const totalUnderReview = await this.countByStatus(1);
    const totalVerified = await this.countByStatus(2);
    const totalRejected = await this.countByStatus(3);
    return {
      success: true,
      message: 'merchant Profiles',
      data: merchant,
      count: {
        totalCount: totalCount,
        totalPending: totalPending,
        totalRejected: totalRejected,
        totalUnderReview: totalUnderReview,
        totalVerified: totalVerified,
      }
    };
  }

  // Get merchant profiles by id...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/merchant-profiles/{id}')
  async getMerchantProfile(
    @param.path.string('id') id: string,
    @param.filter(MerchantProfiles) filter?: Filter<MerchantProfiles>,
  ): Promise<{
    success: boolean;
    message: string;
    data: MerchantProfiles;
  }> {
    const merchant = await this.merchantProfilesRepository.findById(id, {
      ...filter,
      include: [
        {
          relation: 'users',
          scope: {fields: {id: true, phone: true, email: true}},
        },
        {relation: 'kycApplications'},
        {
          relation: 'merchantPanCard',
          scope: {
            include: [
              {
                relation: 'media',
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
        {relation: 'merchantDealershipType'},
        {
          relation: 'media',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    return {
      success: true,
      message: 'Merchant Profiles',
      data: merchant,
    };
  }


  // for merchant bank details upload
  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @post('/merchant-profiles/bank-details')
  async uploadMerchantBanksDetails(
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
    const merchant = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });


    if (!merchant) throw new HttpErrors.NotFound('Merchant not found');

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: merchant.usersId,
      mode: 1,
      status: 0,
      roleValue: 'merchant',
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    return result;
  }

  // fetch bank accounts...
  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/merchant-profiles/bank-details')
  async fetchBankDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccounts(
        merchantProfile.usersId,
        'merchant',
      );

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.accounts,
    };
  }

  // fetch bank account
  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/merchant-profiles/bank-details/{accountId}')
  async fetchBankDetailsWithId(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails}> {
    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccount(accountId);

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.account,
    };
  }

  // Update Bank account info for company...
  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @patch('/merchant-profiles/bank-details/{accountId}')
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
    const tx = await this.merchantProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );
    try {
      const merchantProfile = await this.merchantProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!merchantProfile) {
        throw new HttpErrors.NotFound('Company not found');
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


  // fetch UBOs...
  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/merchant-profiles/bank-details')
  async fetchUBODetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccounts(
        merchantProfile.usersId,
        'merchant',
      );

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.accounts,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/merchant-profiles/UBO-details')
  async fetchUboDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean, message: string, UboDetails: MerchantUboDetails[]}> {
    const merchantProfiles = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!merchantProfiles) {
      throw HttpErrors.NotFound('Merchant not found');
    }
    const uboDetails = await this.merchantUboDetailsService.fetchMerchantUboDetails(
      merchantProfiles?.usersId,
      merchantProfiles?.id
    );

    return {
      success: true,
      message: 'UBO Details',
      UboDetails: uboDetails.uboDetails
    }
  }


  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/merchant-profiles/PSP-details')
  async fetchPSPDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean, message: string, pspDetails: Psp[]}> {
    const merchantProfiles = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!merchantProfiles) {
      throw HttpErrors.NotFound('Merchant not found');
    }
    const pspDetails = await this.pspService.fetchMerchantPsp(
      merchantProfiles?.usersId,
      merchantProfiles?.id
    );

    return {
      success: true,
      message: 'PSP Details',
      pspDetails: pspDetails.psp
    }
  }

  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @post('/merchant-profiles/PSP-details')
  async createPSPDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['psp'],
            properties: {
              psp: {type: 'object'},
            },
          },
        },
      },
    })
    body: {
      psp: Partial<Psp>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    psp: Psp;
  }> {
    const tx =
      await this.merchantProfilesRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const merchant = await this.merchantProfilesRepository.findOne(
        {
          where: {
            usersId: currentUser.id,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      if (!merchant) {
        throw new HttpErrors.NotFound('Merchant not found');
      }

      const result = await this.pspService.upsertMerchantPsp(
        merchant.id,
        merchant.usersId,
        body.psp,
        undefined,
        tx,
      );

      await tx.commit();

      return {
        success: result.success,
        message: result.message,
        psp: result.psp,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @patch('/merchant-profiles/PSP-details/{pspId}')
  async updatePSPDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('pspId') pspId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['psp'],
            properties: {
              psp: {type: 'object'},
            },
          },
        },
      },
    })
    body: {
      psp: Partial<Psp>;
    },
  ): Promise<{
    success: boolean;
    message: string;
    psp: Psp;
  }> {
    const tx =
      await this.merchantProfilesRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const merchant = await this.merchantProfilesRepository.findOne(
        {
          where: {
            usersId: currentUser.id,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      if (!merchant) {
        throw new HttpErrors.NotFound('Merchant not found');
      }

      const result = await this.pspService.upsertMerchantPsp(
        merchant.id,
        merchant.usersId,
        body.psp,
        pspId,
        tx,
      );


      await tx.commit();

      return {
        success: result.success,
        message: result.message,
        psp: result.psp,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @patch('/merchant-profiles/update-general-info')
  async updateMerchantProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              merchantLogo: {type: 'string'},
              merchantAbout: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      merchantLogo?: string;
      merchantAbout?: string;
    },
  ): Promise<{
    success: boolean;
    message: string;
    updatedProfile: MerchantProfiles;
  }> {
    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    await this.merchantProfilesRepository.updateById(merchantProfile.id, {
      ...body,
    });

    const updatedMerchantProfile = await this.merchantProfilesRepository.findById(
      merchantProfile.id,
      {
        include: [
          {
            relation: 'merchantPanCard',
            scope: {
              include: [
                {
                  relation: 'media',
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
            relation: 'merchantDealershipType'
          },
          {
            relation: 'users',
            scope: {fields: {id: true, phone: true, email: true}},
          },
          {
            relation: 'media',
            scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
          },
        ],
      },
    );

    if (
      merchantProfile.merchantLogo &&
      merchantProfile.merchantLogo !== updatedMerchantProfile.merchantLogo
    ) {
      await this.mediaService.updateMediaUsedStatus(
        [merchantProfile.merchantLogo],
        false,
      );
      await this.mediaService.updateMediaUsedStatus(
        [updatedMerchantProfile.merchantLogo],
        true,
      );
    }

    return {
      success: true,
      message: 'Merchant profile updated',
      updatedProfile: updatedMerchantProfile,
    };
  }

}
