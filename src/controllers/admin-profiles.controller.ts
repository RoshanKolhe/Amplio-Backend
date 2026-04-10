import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {get, HttpErrors, param, patch, requestBody, SchemaObject} from '@loopback/rest';
import {authorize} from '../authorization';
import {
  AddressDetails,
  AuthorizeSignatories,
  BankDetails,
  CompanyKycDocument,
  ComplianceAndDeclarations,
  InvestmentMandate,
  InvestorKycDocument,
  PlatformAgreement,
  UboDetails,
  UserUploadedDocuments,
} from '../models';
import {
  CompanyProfilesRepository,
  InvestorProfileRepository,
  TrusteeProfilesRepository,
} from '../repositories';
import {BankDetailsService} from '../services/bank-details.service';
import {AddressDetailsService} from '../services/address-details.service';
import {AuthorizeSignatoriesService} from '../services/signatories.service';
import {UserUploadedDocumentsService} from '../services/user-documents.service';
import {CompanyKycDocumentService} from '../services/company-kyc-document.service';
import {InvestorKycDocumentService} from '../services/investor-kyc-document.service';
import {UboDetailsService} from '../services/ubo-details.service';
import {ComplianceAndDeclarationsService} from '../services/compliance-and-declarations.service';
import {InvestmentMandateService} from '../services/investment-mandate.service';
import {PlatformAgreementService} from '../services/platform-agreement.service';

const investorAuthorizeSignatoryVerificationRequestSchema: SchemaObject = {
  oneOf: [
    {
      type: 'object',
      required: ['status', 'signatoryId'],
      properties: {
        status: {type: 'number', enum: [1]},
        signatoryId: {type: 'string'},
        reason: {type: 'string'},
        rejectReason: {type: 'string'},
      },
    },
    {
      type: 'object',
      required: ['status', 'signatoryId', 'rejectReason'],
      properties: {
        status: {type: 'number', enum: [2]},
        signatoryId: {type: 'string'},
        reason: {type: 'string'},
        rejectReason: {type: 'string', minLength: 1},
      },
    },
    {
      type: 'object',
      required: ['status', 'signatoryId', 'reason'],
      properties: {
        status: {type: 'number', enum: [2]},
        signatoryId: {type: 'string'},
        reason: {type: 'string', minLength: 1},
        rejectReason: {type: 'string'},
      },
    },
  ],
};

const investorAddressVerificationRequestSchema: SchemaObject = {
  oneOf: [
    {
      type: 'object',
      required: ['investorId', 'status'],
      properties: {
        investorId: {type: 'string'},
        status: {type: 'number', enum: [1]},
        reason: {type: 'string'},
        rejectReason: {type: 'string'},
      },
    },
    {
      type: 'object',
      required: ['investorId', 'status', 'rejectReason'],
      properties: {
        investorId: {type: 'string'},
        status: {type: 'number', enum: [2]},
        reason: {type: 'string'},
        rejectReason: {type: 'string', minLength: 1},
      },
    },
    {
      type: 'object',
      required: ['investorId', 'status', 'reason'],
      properties: {
        investorId: {type: 'string'},
        status: {type: 'number', enum: [2]},
        reason: {type: 'string', minLength: 1},
        rejectReason: {type: 'string'},
      },
    },
  ],
};

export class AdminProfilesController {
  constructor(
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @repository(CompanyProfilesRepository)
    private companyProfilesRepository: CompanyProfilesRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @inject('service.companyKycDocumentService.service')
    private companyKycDocumentService: CompanyKycDocumentService,
    @inject('service.investorKycDocumentService.service')
    private investorKycDocumentService: InvestorKycDocumentService,
    @inject('service.userUploadedDocuments.service')
    private userUploadDocumentsService: UserUploadedDocumentsService,
    @inject('service.bankDetails.service')
    private bankDetailsService: BankDetailsService,
    @inject('services.AuthorizeSignatoriesService.service')
    private authorizeSignatoriesService: AuthorizeSignatoriesService,
    @inject('service.AddressDetails.service')
    private addressDetailsService: AddressDetailsService,
    @inject('service.uboDetailsService.service')
    private uboDetailsService: UboDetailsService,
    @inject('service.complianceAndDeclarationsService.service')
    private complianceAndDeclarationsService: ComplianceAndDeclarationsService,
    @inject('service.investmentMandateService.service')
    private investmentMandateService: InvestmentMandateService,
    @inject('service.platformAgreementService.service')
    private platformAgreementService: PlatformAgreementService,
  ) {}

  // ------------------------------------------------Trustee Profile API's-------------------------------------------------
  // fetch bank accounts...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{trusteeId}/bank-details')
  async fetchBankDetails(
    @param.path.string('trusteeId') trusteeId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{id: trusteeId}, {isDeleted: false}],
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
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{trusteeId}/bank-details/{accountId}')
  async fetchBankDetailsWithId(
    @param.path.string('trusteeId') trusteeId: string,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails}> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{id: trusteeId}, {isDeleted: false}],
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

  // fetch authorize signatories...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{trusteeId}/authorize-signatory')
  async fetchAuthorizeSignatories(
    @param.path.string('trusteeId') trusteeId: string,
    @param.filter(AuthorizeSignatories) filter: Filter<AuthorizeSignatories>,
  ): Promise<{
    success: boolean;
    message: string;
    signatories: AuthorizeSignatories[];
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{id: trusteeId}, {isDeleted: false}],
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
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{trusteeId}/authorize-signatory/{signatoryId}')
  async fetchAuthorizeSignatory(
    @param.path.string('trusteeId') trusteeId: string,
    @param.path.string('signatoryId') signatoryId: string,
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{id: trusteeId}, {isDeleted: false}],
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

  // fetch documents
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{trusteeId}/documents')
  async fetchDocuments(
    @param.path.string('trusteeId') trusteeId: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: UserUploadedDocuments[];
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{id: trusteeId}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const documentsResponse =
      await this.userUploadDocumentsService.fetchDocumentsWithUser(
        trusteeProfile.usersId,
        trusteeProfile.id,
        'trustee',
      );

    return {
      success: true,
      message: 'Documents data',
      documents: documentsResponse.documents,
    };
  }

  // fetch document...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{trusteeId}/documents/{documentId}')
  async fetchDocument(
    @param.path.string('trusteeId') trusteeId: string,
    @param.path.string('documentId') documentId: string,
  ): Promise<{
    success: boolean;
    message: string;
    document: UserUploadedDocuments;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{id: trusteeId}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const documentsResponse =
      await this.userUploadDocumentsService.fetchDocumentsWithId(documentId);

    return {
      success: true,
      message: 'Authorize signatory data',
      document: documentsResponse.document,
    };
  }

  // fetch trustee address details...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/trustee-profiles/{trusteeId}/address-details')
  async fetchTrusteeAddressDetails(
    @param.path.string('trusteeId') trusteeId: string,
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{id: trusteeId}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('Trustee not found');
    }

    const response = await this.addressDetailsService.fetchUserAddressDetails(
      trusteeProfile.usersId,
      'trustee',
      trusteeProfile.id,
    );

    return response;
  }

  // super admin trustee documents approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/trustee-profiles/document-verification')
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

  // super admin trustee bank account approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/trustee-profiles/bank-account-verification')
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

  // super admin trustee bank signatory approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/trustee-profiles/authorize-signatory-verification')
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

  // ------------------------------------------------Company Profile API's-------------------------------------------------
  // fetch bank accounts...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/bank-details')
  async fetchCompanyBankDetails(
    @param.path.string('companyId') companyId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{id: companyId}, {isDeleted: false}],
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
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/bank-details/{accountId}')
  async fetchCompanyBankDetailsWithId(
    @param.path.string('companyId') companyId: string,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{id: companyId}, {isDeleted: false}],
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

  // fetch authorize signatories...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/authorize-signatory')
  async fetchCompanyAuthorizeSignatories(
    @param.path.string('companyId') companyId: string,
    @param.filter(AuthorizeSignatories) filter?: Filter<AuthorizeSignatories>,
  ): Promise<{
    success: boolean;
    message: string;
    signatories: AuthorizeSignatories[];
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{id: companyId}, {isDeleted: false}],
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
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/authorize-signatory/{signatoryId}')
  async fetchCompanyAuthorizeSignatory(
    @param.path.string('companyId') companyId: string,
    @param.path.string('signatoryId') signatoryId: string,
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{id: companyId}, {isDeleted: false}],
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

  // fetch documents
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/documents')
  async fetchCompanyDocuments(
    @param.path.string('companyId') companyId: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: CompanyKycDocument[];
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{id: companyId}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    return this.companyKycDocumentService.fetchByUser(companyProfile.usersId);
  }

  // fetch document...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/documents/{documentId}')
  async fetchCompanyDocument(
    @param.path.string('companyId') companyId: string,
    @param.path.string('documentId') documentId: string,
  ): Promise<{
    success: boolean;
    message: string;
    document: UserUploadedDocuments;
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{id: companyId}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const documentsResponse =
      await this.userUploadDocumentsService.fetchDocumentsWithId(documentId);

    return {
      success: true,
      message: 'Document data',
      document: documentsResponse.document,
    };
  }

  // fetch company address details...
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/address-details')
  async fetchCompanyAddressDetails(
    @param.path.string('companyId') companyId: string,
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{id: companyId}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const response = await this.addressDetailsService.fetchUserAddressDetails(
      companyProfile.usersId,
      'company',
      companyProfile.id,
    );

    return response;
  }

  // super admin company documents approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-profiles/document-verification')
  async companyDocumentVerification(
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
    const result = await this.companyKycDocumentService.updateStatus(
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
  async comapnyBankAccountVerification(
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
  async companyAuthorizeSignatoryVerification(
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

  // ------------------------------------------------Investor Profile API's-------------------------------------------------

  // fetch investor documents
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/documents')
  async fetchInvestorDocuments(
    @param.path.string('investorId') investorId: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: InvestorKycDocument[];
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    return this.investorKycDocumentService.fetchByUser(investorProfile.usersId);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/investor-profiles/document-verification')
  async investorDocumentVerification(
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
    return this.investorKycDocumentService.updateStatus(
      body.documentId,
      body.status,
      body.reason ?? '',
    );
  }

  // fetch bank account
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/bank-details')
  async fetchInvestorBankDetails(
    @param.path.string('investorId') investorId: string,
  ): Promise<{
    success: boolean;
    message: string;
    bankDetails: BankDetails | null;
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    const bankAccountList = await this.bankDetailsService.fetchUserBankAccounts(
      investorProfile.usersId,
      'investor',
    );

    if (!bankAccountList || bankAccountList?.accounts?.length === 0) {
      return {
        success: true,
        message: 'Bank accounts',
        bankDetails: null,
      };
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccount(
        bankAccountList.accounts[0].id,
      );

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.account,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/address-details')
  async fetchInvestorAddressDetails(
    @param.path.string('investorId') investorId: string,
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    return this.addressDetailsService.fetchUserAddressDetails(
      investorProfile.usersId,
      'investor',
      investorProfile.id,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/investor-profiles/address-verification')
  async investorAddressVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: investorAddressVerificationRequestSchema,
        },
      },
    })
    body: {
      investorId: string;
      status: number;
      reason?: string;
      rejectReason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        id: body.investorId,
        isDeleted: false,
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    const rejectionReason = body.rejectReason ?? body.reason;

    if (body.status === 1) {
      return this.addressDetailsService.approveUserAddressDetails(
        investorProfile.usersId,
        'investor',
        investorProfile.id,
      );
    }

    if (body.status === 2) {
      return this.addressDetailsService.rejectUserAddressDetails(
        investorProfile.usersId,
        'investor',
        investorProfile.id,
        rejectionReason ?? '',
      );
    }

    throw new HttpErrors.BadRequest('Invalid status');
  }

  // super admin investor bank account approval API
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/investor-profiles/bank-account-verification')
  async investorBankAccountVerification(
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

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/authorize-signatory')
  async fetchInvestorAuthorizeSignatories(
    @param.path.string('investorId') investorId: string,
    @param.filter(AuthorizeSignatories) filter?: Filter<AuthorizeSignatories>,
  ): Promise<{
    success: boolean;
    message: string;
    signatories: AuthorizeSignatories[];
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    return this.authorizeSignatoriesService.fetchAuthorizeSignatories(
      investorProfile.usersId,
      'investor',
      investorProfile.id,
      filter,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/investor-profiles/authorize-signatory-verification')
  async investorAuthorizeSignatoryVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: investorAuthorizeSignatoryVerificationRequestSchema,
        },
      },
    })
    body: {
      status: number;
      signatoryId: string;
      reason?: string;
      rejectReason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const rejectionReason = body.rejectReason ?? body.reason;

    if (body.status === 2 && !rejectionReason?.trim()) {
      throw new HttpErrors.BadRequest(
        'rejectReason is required when rejecting a signatory',
      );
    }

    return this.authorizeSignatoriesService.updateSignatoryStatus(
      body.signatoryId,
      body.status,
      rejectionReason ?? '',
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/ubo-details')
  async fetchInvestorUboDetails(
    @param.path.string('investorId') investorId: string,
    @param.filter(UboDetails) filter?: Filter<UboDetails>,
  ): Promise<{
    success: boolean;
    message: string;
    uboDetails: UboDetails[];
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    const uboResponse = await this.uboDetailsService.fetchUbosDetails(
      investorProfile.usersId,
      'investor',
      investorProfile.id,
      filter,
    );

    return {
      success: true,
      message: 'UBO details',
      uboDetails: uboResponse.ubos,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/investor-profiles/ubo-verification')
  async investorUboVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'uboId'],
            properties: {
              status: {type: 'number'},
              uboId: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      uboId: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    return this.uboDetailsService.updateUBOSStatus(
      body.uboId,
      body.status,
      body.reason ?? '',
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/compliance-declarations')
  async fetchInvestorComplianceDeclarations(
    @param.path.string('investorId') investorId: string,
  ): Promise<{
    success: boolean;
    message: string;
    complianceDeclaration: ComplianceAndDeclarations | null;
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    return this.complianceAndDeclarationsService.fetchUserComplianceDeclaration(
      investorProfile.usersId,
      'investor',
      investorProfile.id,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/investment-mandate')
  async fetchInvestorInvestmentMandate(
    @param.path.string('investorId') investorId: string,
  ): Promise<{
    success: boolean;
    message: string;
    investmentMandate: InvestmentMandate | null;
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    return this.investmentMandateService.fetchUserInvestmentMandate(
      investorProfile.usersId,
      'investor',
      investorProfile.id,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/investor-profiles/{investorId}/platform-agreement')
  async fetchInvestorPlatformAgreement(
    @param.path.string('investorId') investorId: string,
  ): Promise<{
    success: boolean;
    message: string;
    platformAgreement: PlatformAgreement | null;
  }> {
    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{id: investorId}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    return this.platformAgreementService.fetchUserPlatformAgreement(
      investorProfile.usersId,
      'investor',
      investorProfile.id,
    );
  }

  // ------------------------------------------------Merchant Profile PSP API-------------------------------------------------
  // super admin merchant psp approval API

}
