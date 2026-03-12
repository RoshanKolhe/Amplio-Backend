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
} from '../models';
import {
  KycApplicationsRepository,
  MerchantProfilesRepository,
} from '../repositories';
import {AddressDetailsService} from '../services/address-details.service';
import {BankDetailsService} from '../services/bank-details.service';
import {MerchantKycDocumentService} from '../services/merchant-kyc-document.service';
import {MerchantUboDetailsService} from '../services/merchant-ubo-details.service';
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
      'psp'
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
      const merchantDealershipType = (merchantProfile as MerchantProfiles & {
        merchantDealershipType?: {id: string; label: string; value: string};
      }).merchantDealershipType
        ? {
          id: (merchantProfile as MerchantProfiles & {
            merchantDealershipType: {id: string; label: string; value: string};
          }).merchantDealershipType.id,
          label: (merchantProfile as MerchantProfiles & {
            merchantDealershipType: {id: string; label: string; value: string};
          }).merchantDealershipType.label,
          value: (merchantProfile as MerchantProfiles & {
            merchantDealershipType: {id: string; label: string; value: string};
          }).merchantDealershipType.value,
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
      const addressResponse = await this.addressDetailsService.fetchUserAddressDetails(
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
    const tx = await this.merchantProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

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

      const result = await this.merchantKycDocumentService.uploadDocumentsForKyc(
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
    const tx = await this.merchantProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

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

      const result = await this.merchantUboDetailsService.createMerchantUboDetails(
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
    return this.uploadMerchantKycUboDetails(body);
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
}
