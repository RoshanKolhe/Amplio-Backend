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
  AuthorizeSignatories,
  BankDetails,
  CompanyProfiles,
  UserUploadedDocuments,
} from '../models';
import {
  CompanyProfilesRepository,
  KycApplicationsRepository,
} from '../repositories';
import {AddressDetailsService} from '../services/address-details.service';
import {BankDetailsService} from '../services/bank-details.service';
import {KycService} from '../services/kyc.service';
import {MediaService} from '../services/media.service';
import {SessionService} from '../services/session.service';
import {AuthorizeSignatoriesService} from '../services/signatories.service';
import {UserUploadedDocumentsService} from '../services/user-documents.service';

export class CompaniesController {
  constructor(
    @repository(CompanyProfilesRepository)
    private companyProfilesRepository: CompanyProfilesRepository,
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @inject('service.media.service')
    private mediaService: MediaService,
    @inject('service.userUploadedDocuments.service')
    private userUploadDocumentsService: UserUploadedDocumentsService,
    @inject('service.bankDetails.service')
    private bankDetailsService: BankDetailsService,
    @inject('services.AuthorizeSignatoriesService.service')
    private authorizeSignatoriesService: AuthorizeSignatoriesService,
    @inject('service.kyc.service')
    private kycService: KycService,
    @inject('service.session.service')
    private sessionService: SessionService,
    @inject('service.AddressDetails.service')
    private addressDetailsService: AddressDetailsService,
  ) { }

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

  // for companies get current progress at start...
  @get('/company-profiles/kyc-progress/{sessionId}')
  async getCompanyProfileKycProgress(
    @param.path.string('sessionId') sessionId: string,
  ): Promise<{
    success: boolean;
    message: string;
    currentProgress: string[];
    profile: CompanyProfiles | null;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await this.sessionService.fetchProfile(sessionId);
    if (response.success && response?.profile?.id) {
      const companyProfile = await this.companyProfilesRepository.findOne({
        where: {
          and: [{usersId: response?.profile?.id}, {isDeleted: false}],
        },
        include: [
          {
            relation: 'companyPanCards',
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
          {relation: 'companyEntityType'},
          {relation: 'companySectorType'},
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

      if (!companyProfile) {
        return {
          success: true,
          message: 'New Profile',
          currentProgress: [],
          profile: null,
        };
      }

      const currentProgress = await this.getKycApplicationStatus(
        companyProfile.kycApplicationsId,
      );

      return {
        success: true,
        message: 'New Profile',
        currentProgress: currentProgress,
        profile: companyProfile,
      };
    }

    return {
      success: true,
      message: 'New Profile',
      currentProgress: [],
      profile: null,
    };
  }

  // fetch company info with stepper...
  @get('/company-profiles/kyc-get-data/{stepperId}/{usersId}')
  async getCompanyProfileKycData(
    @param.path.string('stepperId') stepperId: string,
    @param.path.string('usersId') usersId: string,
    @param.query.string('route') route?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{success: boolean; message: string; data: any}> {
    const steppersAllowed = [
      'company_documents',
      'company_bank_details',
      'company_authorized_signatories',
    ];

    if (!steppersAllowed.includes(stepperId)) {
      throw new HttpErrors.BadRequest('Invalid stepper id');
    }

    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: usersId}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const currentProgress = await this.getKycApplicationStatus(
      companyProfile.kycApplicationsId,
    );

    if (!currentProgress.includes(stepperId)) {
      throw new HttpErrors.BadRequest('Please complete the steps');
    }

    if (stepperId === 'company_documents') {
      if (!route) {
        throw new HttpErrors.NotFound('Params are missing');
      }

      const documentsResponse =
        await this.userUploadDocumentsService.fetchDocuments(
          companyProfile.usersId,
          companyProfile.id,
          'company',
          route,
        );

      return {
        success: true,
        message: 'Documents Data',
        data: documentsResponse.documents,
      };
    }

    if (stepperId === 'company_bank_details') {
      const bankDetailsResponse =
        await this.bankDetailsService.fetchUserBankAccounts(
          companyProfile.usersId,
          'company',
        );

      return {
        success: true,
        message: 'Bank accounts',
        data: bankDetailsResponse.accounts,
      };
    }

    if (stepperId === 'company_authorized_signatories') {
      const signatoriesResponse =
        await this.authorizeSignatoriesService.fetchAuthorizeSignatories(
          companyProfile.usersId,
          'company',
          companyProfile.id,
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

  // for company but without login just for KYC
  @post('/company-profiles/kyc-upload-documents')
  async uploadCompanyKYCDocuments(
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
                  required: ['documentsId', 'documentsFileId'],
                  properties: {
                    documentsId: {type: 'string'},
                    documentsFileId: {type: 'string'},
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
      documents: {documentsId: string; documentsFileId: string}[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: UserUploadedDocuments[];
    currentProgress: string[];
  }> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const company = await this.companyProfilesRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!company) throw new HttpErrors.NotFound('Company not found');

      const newDocs = body.documents.map(
        doc =>
          new UserUploadedDocuments({
            ...doc,
            roleValue: 'company',
            identifierId: company.id,
            usersId: body.usersId,
            status: 0,
            mode: 1,
            isActive: true,
            isDeleted: false,
          }),
      );

      const result = await this.userUploadDocumentsService.uploadNewDocuments(
        newDocs,
        tx,
      );

      const currentProgress = await this.updateKycProgress(
        company.kycApplicationsId,
        'company_documents',
      );

      await tx.commit();

      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // for company but without login just for KYC
  @post('/company-profiles/kyc-bank-details')
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
    const company = await this.companyProfilesRepository.findOne({
      where: {usersId: body.usersId, isDeleted: false},
    });

    if (!company) throw new HttpErrors.NotFound('Company not found');

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: body.usersId,
      mode: 1,
      status: 0,
      roleValue: 'company',
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    const currentProgress = await this.updateKycProgress(
      company.kycApplicationsId,
      'company_bank_details',
    );

    return {...result, currentProgress};
  }

  // for company but without login just for KYC
  @post('/company-profiles/kyc-authorize-signatories')
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
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const company = await this.companyProfilesRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!company) throw new HttpErrors.NotFound('Company not found');

      const signatoriesData = body.signatories.map(
        s =>
          new AuthorizeSignatories({
            ...s,
            usersId: body.usersId,
            roleValue: 'company',
            identifierId: company.id,
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
        company.kycApplicationsId,
      );

      if (result.createdAuthorizeSignatories.length > 0) {
        currentProgress = await this.updateKycProgress(
          company.kycApplicationsId,
          'company_authorized_signatories',
        );
      }

      await tx.commit();
      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // for company but without login just for KYC
  @post('/company-profiles/kyc-authorize-signatory')
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
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const company = await this.companyProfilesRepository.findOne(
        {where: {usersId: body.usersId, isDeleted: false}},
        {transaction: tx},
      );

      if (!company) throw new HttpErrors.NotFound('Company not found');

      const signatoriesData = new AuthorizeSignatories({
        ...body.signatory,
        usersId: body.usersId,
        roleValue: 'company',
        identifierId: company.id,
        isActive: true,
        isDeleted: false,
      });

      const result =
        await this.authorizeSignatoriesService.createAuthorizeSignatory(
          signatoriesData,
        );

      const currentProgress = await this.updateKycProgress(
        company.kycApplicationsId,
        'company_authorized_signatories',
      );

      await tx.commit();
      return {...result, currentProgress};
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // get my company profile..
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-profiles/me')
  async getMyCompanyProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean; message: string; profile: CompanyProfiles}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
      include: [
        {
          relation: 'companyPanCards',
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
        {relation: 'companyEntityType'},
        {relation: 'companySectorType'},
        {
          relation: 'companyLogoData',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('No company profile found');
    }

    return {
      success: true,
      message: 'Company Profile data',
      profile: companyProfile,
    };
  }

  // Get company profiles...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles')
  async getCompanyProfiles(
    @param.filter(CompanyProfiles) filter?: Filter<CompanyProfiles>,
    @param.query.number('status') status?: number,
  ): Promise<{
    success: boolean;
    message: string;
    data: CompanyProfiles[];
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
        'company',
      );

      rootWhere = {
        ...filter?.where,
        id: {inq: filteredProfiles.profileIds},
      };
    }

    const company = await this.companyProfilesRepository.find({
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
        {relation: 'companyEntityType'},
        {relation: 'companySectorType'},
        {
          relation: 'companyLogoData',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });


    const countFilter = {
      isDeleted: false,
    }

    const totalCount = (await this.companyProfilesRepository.count(filter?.where)).count;

    const totalRejected = (await this.kycApplicationsRepository.count({...countFilter, status: 3, })).count;

    const totalPending = (await this.kycApplicationsRepository.count({...countFilter, status: 0, })).count;

    const totalUnderReview = (await this.kycApplicationsRepository.count({...countFilter, status: 1, })).count;

    const totalVerified = (await this.kycApplicationsRepository.count({...countFilter, status: 2, })).count;


    return {
      success: true,
      message: 'Company Profiles',
      data: company,
      count: {
        totalCount: totalCount,
        totalPending: totalPending,
        totalRejected: totalRejected,
        totalUnderReview: totalUnderReview,
        totalVerified: totalVerified,
      }
    };
  }

  // Get company profiles by id...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{id}')
  async getCompanyProfile(
    @param.path.string('id') id: string,
    @param.filter(CompanyProfiles) filter?: Filter<CompanyProfiles>,
  ): Promise<{
    success: boolean;
    message: string;
    data: CompanyProfiles;
  }> {
    const company = await this.companyProfilesRepository.findById(id, {
      ...filter,
      include: [
        {
          relation: 'users',
          scope: {fields: {id: true, phone: true, email: true}},
        },
        {relation: 'kycApplications'},
        {
          relation: 'companyPanCards',
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
        {relation: 'companyEntityType'},
        {relation: 'companySectorType'},
        {
          relation: 'companyLogoData',
          scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
        },
      ],
    });

    return {
      success: true,
      message: 'Company Profiles',
      data: company,
    };
  }

  // update company general data...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/company-profiles/update-general-info')
  async updateCompanyProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              companyLogo: {type: 'string'},
              companyAbout: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      companyLogo?: string;
      companyAbout?: string;
    },
  ): Promise<{
    success: boolean;
    message: string;
    updatedProfile: CompanyProfiles;
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    await this.companyProfilesRepository.updateById(companyProfile.id, {
      ...body,
    });

    const updatedCompanyProfile = await this.companyProfilesRepository.findById(
      companyProfile.id,
      {
        include: [
          {
            relation: 'companyPanCards',
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
          {relation: 'companyEntityType'},
          {relation: 'companySectorType'},
          {
            relation: 'companyLogoData',
            scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}},
          },
        ],
      },
    );

    if (
      companyProfile.companyLogo &&
      companyProfile.companyLogo !== updatedCompanyProfile.companyLogo
    ) {
      await this.mediaService.updateMediaUsedStatus(
        [companyProfile.companyLogo],
        false,
      );
      await this.mediaService.updateMediaUsedStatus(
        [updatedCompanyProfile.companyLogo],
        true,
      );
    }

    return {
      success: true,
      message: 'Company profile updated',
      updatedProfile: updatedCompanyProfile,
    };
  }

  // for Company documents upload
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/company-profiles/upload-documents')
  async uploadCompanyDocuments(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['documents'],
            properties: {
              documents: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['documentsId', 'documentsFileId'],
                  properties: {
                    documentsId: {type: 'string'},
                    documentsFileId: {type: 'string'},
                  },
                },
              },
            },
          },
        },
      },
    })
    body: {
      documents: {documentsId: string; documentsFileId: string}[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: UserUploadedDocuments[];
  }> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const company = await this.companyProfilesRepository.findOne(
        {where: {usersId: currentUser.id, isDeleted: false}},
        {transaction: tx},
      );

      if (!company) throw new HttpErrors.NotFound('Company not found');

      const newDocs = body.documents.map(
        doc =>
          new UserUploadedDocuments({
            ...doc,
            roleValue: 'company',
            identifierId: company.id,
            usersId: company.usersId,
            status: 0,
            mode: 1,
            isActive: true,
            isDeleted: false,
          }),
      );

      const result = await this.userUploadDocumentsService.uploadNewDocuments(
        newDocs,
        tx,
      );

      await tx.commit();

      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // for company authorize signatories upload
  // @post('/company-profiles/authorize-signatories')
  // async uploadAuthorizeSignatories(
  //   @requestBody({
  //     content: {
  //       'application/json': {
  //         schema: {
  //           type: 'object',
  //           required: ['signatories'],
  //           properties: {
  //             signatories: {
  //               type: 'array',
  //               items: {
  //                 type: 'object',
  //                 required: ['fullName', 'email', 'phone', 'submittedPanFullName', 'submittedPanNumber', 'submittedDateOfBirth', 'panCardFileId', 'boardResolutionFileId', 'designationType', 'designationValue'],
  //                 properties: {
  //                   fullName: {type: 'string'},
  //                   email: {type: 'string'},
  //                   phone: {type: 'string'},
  //                   extractedPanFullName: {type: 'string'},
  //                   extractedPanNumber: {type: 'string'},
  //                   extractedDateOfBirth: {type: 'string'},
  //                   submittedPanFullName: {type: 'string'},
  //                   submittedPanNumber: {type: 'string'},
  //                   submittedDateOfBirth: {type: 'string'},
  //                   panCardFileId: {type: 'string'},
  //                   boardResolutionFileId: {type: 'string'},
  //                   designationType: {type: 'string'},
  //                   designationValue: {type: 'string'}
  //                 }
  //               }
  //             }
  //           }
  //         }
  //       }
  //     }
  //   })
  //   body: {
  //     signatories: Array<{
  //       fullName: string;
  //       email: string;
  //       phone: string;
  //       extractedPanFullName?: string;
  //       extractedPanNumber?: string;
  //       extractedDateOfBirth?: string;
  //       submittedPanFullName: string;
  //       submittedPanNumber: string;
  //       submittedDateOfBirth: string;
  //       panCardFileId: string;
  //       boardResolutionFileId: string;
  //       designationType: string;
  //       designationValue: string;
  //     }>
  //   }
  // ): Promise<{
  //   success: boolean;
  //   message: string;
  //   createdAuthorizeSignatories: AuthorizeSignatories[];
  //   erroredAuthrizeSignatories: Array<{
  //     fullName: string;
  //     email: string;
  //     phone: string;
  //     submittedPanNumber: string;
  //     message: string;
  //   }>;
  //   currentProgress: string[];
  // }> {
  //   const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});

  //   try {
  //     const trustee = await this.trusteeProfilesRepository.findOne(
  //       {where: {usersId: body.usersId, isDeleted: false}},
  //       {transaction: tx}
  //     );

  //     if (!trustee) throw new HttpErrors.NotFound("Trustee not found");

  //     const signatoriesData = body.signatories.map(s => new AuthorizeSignatories({
  //       ...s,
  //       usersId: body.usersId,
  //       roleValue: "trustee",
  //       identifierId: trustee.id,
  //       isActive: true,
  //       isDeleted: false
  //     }));

  //     const result = await this.authorizeSignatoriesService.createAuthorizeSignatories(signatoriesData, tx);

  //     let currentProgress = await this.getKycApplicationStatus(trustee.kycApplicationsId);

  //     if (result.createdAuthorizeSignatories.length > 0) {
  //       currentProgress = await this.updateKycProgress(trustee.kycApplicationsId, "trustee_authorized_signatories");
  //     }

  //     await tx.commit();
  //     return {...result, currentProgress};

  //   } catch (err) {
  //     await tx.rollback();
  //     throw err;
  //   }
  // }

  // for company authorize signatories upload
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/company-profiles/authorize-signatory')
  async uploadAuthorizeSignatory(
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
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );

    try {
      const company = await this.companyProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!company) throw new HttpErrors.NotFound('Company not found');

      const signatoriesData = new AuthorizeSignatories({
        ...body.signatory,
        usersId: company.usersId,
        roleValue: 'company',
        identifierId: company.id,
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

  // for company bank details upload
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/company-profiles/bank-details')
  async uploadCompanyBankDetails(
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
    const company = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    console.log('company Data', company);

    if (!company) throw new HttpErrors.NotFound('Company not found');

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: company.usersId,
      mode: 1,
      status: 0,
      roleValue: 'company',
    });

    const result = await this.bankDetailsService.createNewBankAccount(bankData);

    return result;
  }

  // fetch bank accounts...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-profiles/bank-details')
  async fetchBankDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccounts(
        companyProfile.usersId,
        'company',
      );

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.accounts,
    };
  }

  // fetch bank account
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-profiles/bank-details/{accountId}')
  async fetchBankDetailsWithId(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
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
  @authorize({roles: ['company']})
  @patch('/company-profiles/bank-details/{accountId}')
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
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );
    try {
      const companyProfile = await this.companyProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!companyProfile) {
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

  // Change Primary Bank account for company...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/company-profiles/bank-details/{accountId}/primary')
  async updatePrimaryBankAccount(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string}> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );
    try {
      const companyProfile = await this.companyProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!companyProfile) {
        throw new HttpErrors.NotFound('Company not found');
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

  // fetch authorize signatories...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-profiles/authorize-signatory')
  async fetchAuthorizeSignatories(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.filter(AuthorizeSignatories) filter: Filter<AuthorizeSignatories>,
  ): Promise<{
    success: boolean;
    message: string;
    signatories: AuthorizeSignatories[];
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const signatoriesResponse =
      await this.authorizeSignatoriesService.fetchAuthorizeSignatories(
        companyProfile.usersId,
        'company',
        companyProfile.id,
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
  @authorize({roles: ['company']})
  @get('/company-profiles/authorize-signatory/{signatoryId}')
  async fetchAuthorizeSignatory(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('signatoryId') signatoryId: string,
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
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

  // Update Authorize signatory info for company...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/company-profiles/authorize-signatory/{signatoryId}')
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
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction(
      {IsolationLevel: IsolationLevel.READ_COMMITTED},
    );
    try {
      const companyProfile = await this.companyProfilesRepository.findOne(
        {
          where: {
            and: [{usersId: currentUser.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );

      if (!companyProfile) {
        throw new HttpErrors.NotFound('Company not found');
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
  @post('/company-profiles/address-details')
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
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const {registeredAddress, correspondenceAddress} = addressDetails;

    const addressDetailsArray: Partial<AddressDetails>[] = [
      {
        ...registeredAddress,
        mode: 1,
        status: 0,
        usersId: currentUser.id,
        identifierId: companyProfile.id,
        roleValue: 'company',
      },
    ];

    if (correspondenceAddress) {
      addressDetailsArray.push({
        ...correspondenceAddress,
        mode: 1,
        status: 0,
        usersId: currentUser.id,
        identifierId: companyProfile.id,
        roleValue: 'company',
      });
    }

    const response =
      await this.addressDetailsService.createOrUpdateAddressDetails(
        addressDetailsArray,
      );

    return response;
  }

  // fetch company address details...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-profiles/address-details')
  async fetchAddressDetails(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const response = await this.addressDetailsService.fetchUserAddressDetails(
      currentUser.id,
      'company',
      companyProfile.id,
    );

    return response;
  }

  // super admin company documents approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-profiles/document-verification')
  async documentVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'documentId'],
            properties: {
              status: {type: 'number'},
              documentId: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      documentId: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const result = await this.userUploadDocumentsService.updateDocumentStatus(
      body.documentId,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

  // super admin company bank account approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-profiles/bank-account-verification')
  async bankAccountVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'accountId'],
            properties: {
              status: {type: 'number'},
              accountId: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      accountId: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const result = await this.bankDetailsService.updateAccountStatus(
      body.accountId,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

  // super admin company bank signatory approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-profiles/authorize-signatory-verification')
  async authorizeSignatoryVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'signatoryId'],
            properties: {
              status: {type: 'number'},
              signatoryId: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      signatoryId: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const result = await this.authorizeSignatoriesService.updateSignatoryStatus(
      body.signatoryId,
      body.status,
      body.reason ?? '',
    );

    return result;
  }
}
