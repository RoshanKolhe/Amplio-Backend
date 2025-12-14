import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, IsolationLevel, repository} from '@loopback/repository';
import {get, getModelSchemaRef, HttpErrors, param, patch, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {AuthorizeSignatories, BankDetails, CompanyProfiles, UserUploadedDocuments} from '../models';
import {CompanyProfilesRepository} from '../repositories';
import {BankDetailsService} from '../services/bank-details.service';
import {KycService} from '../services/kyc.service';
import {MediaService} from '../services/media.service';
import {AuthorizeSignatoriesService} from '../services/signatories.service';
import {UserUploadedDocumentsService} from '../services/user-documents.service';

export class CompaniesController {
  constructor(
    @repository(CompanyProfilesRepository)
    private companyProfilesRepository: CompanyProfilesRepository,
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
  ) { }

  // get my company profile..
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-profiles/me')
  async getMyCompanyProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile
  ): Promise<{success: boolean; message: string; profile: CompanyProfiles}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'companyPanCards', scope: {include: [{relation: 'panCardDocument', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}]}},
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'companyEntityType'},
        {relation: 'companySectorType'},
        {relation: 'companyLogoData', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}},
      ]
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('No company profile found');
    }

    return {
      success: true,
      message: 'Company Profile data',
      profile: companyProfile
    }
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
    data: {
      count: number;
      profiles: CompanyProfiles[];
    }
  }> {
    let rootWhere = {
      ...filter?.where
    };

    if (status !== undefined && status !== null) {
      const filteredProfiles = await this.kycService.handleKycApplicationFilter(status, 'company');

      rootWhere = {
        ...filter?.where,
        id: {inq: filteredProfiles.profileIds}
      }
    };

    const company = await this.companyProfilesRepository.find({
      ...filter,
      where: rootWhere,
      limit: filter?.limit ?? 10,
      skip: filter?.skip ?? 0,
      include: [
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'kycApplications', scope: {fields: {id: true, usersId: true, status: true, mode: true}}},
        {relation: 'companyEntityType'},
        {relation: 'companySectorType'},
        {relation: 'companyLogoData', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}},
      ]
    });

    const totalCount = (await this.companyProfilesRepository.count(filter?.where)).count;

    return {
      success: true,
      message: 'Company Profiles',
      data: {
        count: totalCount,
        profiles: company
      }
    }
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
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'kycApplications'},
        {relation: 'companyPanCards', scope: {include: [{relation: 'panCardDocument', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}]}},
        {relation: 'companyEntityType'},
        {relation: 'companySectorType'},
        {relation: 'companyLogoData', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}},
      ]
    });

    return {
      success: true,
      message: 'Company Profiles',
      data: company
    }
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
              companyAbout: {type: 'string'}
            }
          }
        }
      }
    })
    body: {
      companyLogo?: string;
      companyAbout?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    updatedProfile: CompanyProfiles
  }> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    await this.companyProfilesRepository.updateById(companyProfile.id, {...body});

    const updatedCompanyProfile = await this.companyProfilesRepository.findById(companyProfile.id, {
      include: [
        {relation: 'companyPanCards', scope: {include: [{relation: 'panCardDocument', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}]}},
        {relation: 'users', scope: {fields: {id: true, phone: true, email: true}}},
        {relation: 'companyEntityType'},
        {relation: 'companySectorType'},
        {relation: 'companyLogoData', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}},
      ]
    });

    if (companyProfile.companyLogo && companyProfile.companyLogo !== updatedCompanyProfile.companyLogo) {
      await this.mediaService.updateMediaUsedStatus([companyProfile.companyLogo], false);
      await this.mediaService.updateMediaUsedStatus([updatedCompanyProfile.companyLogo], true);
    }

    return {
      success: true,
      message: 'Company profile updated',
      updatedProfile: updatedCompanyProfile
    }
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
                    documentsFileId: {type: 'string'}
                  }
                }
              }
            }
          }
        }
      }
    })
    body: {
      documents: {documentsId: string; documentsFileId: string;}[];
    }
  ): Promise<{success: boolean; message: string; uploadedDocuments: UserUploadedDocuments[]}> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});

    try {
      const company = await this.companyProfilesRepository.findOne(
        {where: {usersId: currentUser.id, isDeleted: false}},
        {transaction: tx}
      );

      if (!company) throw new HttpErrors.NotFound("Company not found");

      const newDocs = body.documents.map(doc => new UserUploadedDocuments({
        ...doc,
        roleValue: 'company',
        identifierId: company.id,
        usersId: company.usersId,
        status: 0,
        mode: 1,
        isActive: true,
        isDeleted: false,
      }));

      const result = await this.userUploadDocumentsService.uploadNewDocuments(newDocs, tx);

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
                required: ['fullName', 'email', 'phone', 'submittedPanFullName', 'submittedPanNumber', 'submittedDateOfBirth', 'panCardFileId', 'boardResolutionFileId', 'designationType', 'designationValue'],
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
                  designationValue: {type: 'string'}
                }
              }
            }
          }
        }
      }
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
      }
    }
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
  }> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});

    try {
      const company = await this.companyProfilesRepository.findOne({
        where: {
          and: [
            {usersId: currentUser.id},
            {isDeleted: false}
          ]
        }
      },
        {transaction: tx}
      );

      if (!company) throw new HttpErrors.NotFound("Company not found");

      const signatoriesData = new AuthorizeSignatories({
        ...body.signatory,
        usersId: company.usersId,
        roleValue: "company",
        identifierId: company.id,
        isActive: true,
        isDeleted: false
      });

      const result = await this.authorizeSignatoriesService.createAuthorizeSignatory(signatoriesData);

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
  }> {
    const company = await this.companyProfilesRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isDeleted: false}
        ]
      }
    });

    console.log('company Data', company);

    if (!company) throw new HttpErrors.NotFound("Company not found");

    const bankData = new BankDetails({
      ...body.bankDetails,
      usersId: company.usersId,
      mode: 1,
      status: 0,
      roleValue: 'company'
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
        and: [
          {usersId: currentUser.id},
          {isDeleted: false}
        ]
      }
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const bankDetailsResponse = await this.bankDetailsService.fetchUserBankAccounts(companyProfile.usersId, 'company');

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.accounts
    }
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
        and: [
          {usersId: currentUser.id},
          {isDeleted: false}
        ]
      }
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const bankDetailsResponse = await this.bankDetailsService.fetchUserBankAccount(accountId);

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.account
    }
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
          schema: getModelSchemaRef(BankDetails, {partial: true})
        }
      }
    })
    accountData: Partial<BankDetails>
  ): Promise<{success: boolean; message: string; account: BankDetails | null}> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});
    try {
      const companyProfile = await this.companyProfilesRepository.findOne({
        where: {
          and: [
            {usersId: currentUser.id},
            {isDeleted: false}
          ]
        }
      }, {transaction: tx});

      if (!companyProfile) {
        throw new HttpErrors.NotFound('Company not found');
      }

      const bankDetailsResponse = await this.bankDetailsService.updateBankAccountInfo(accountId, accountData, tx);

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
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});
    try {
      const companyProfile = await this.companyProfilesRepository.findOne({
        where: {
          and: [
            {usersId: currentUser.id},
            {isDeleted: false}
          ]
        }
      }, {transaction: tx});

      if (!companyProfile) {
        throw new HttpErrors.NotFound('Company not found');
      }

      const bankDetailsResponse = await this.bankDetailsService.markAccountAsPrimaryAccount(accountId, tx);

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
    @param.filter(AuthorizeSignatories) filter: Filter<AuthorizeSignatories>
  ): Promise<{success: boolean; message: string; signatories: AuthorizeSignatories[]}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isDeleted: false}
        ]
      }
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const signatoriesResponse = await this.authorizeSignatoriesService.fetchAuthorizeSignatories(companyProfile.usersId, 'company', companyProfile.id, filter);

    return {
      success: true,
      message: 'Authorize signatories',
      signatories: signatoriesResponse.signatories
    }
  }

  // fetch authorize signatory
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-profiles/authorize-signatory/{signatoryId}')
  async fetchAuthorizeSignatory(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('signatoryId') signatoryId: string,
  ): Promise<{success: boolean; message: string; signatory: AuthorizeSignatories}> {
    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isDeleted: false}
        ]
      }
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const signatoriesResponse = await this.authorizeSignatoriesService.fetchAuthorizeSignatory(signatoryId);

    return {
      success: true,
      message: 'Authorize signatory data',
      signatory: signatoriesResponse.signatory
    }
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
          schema: getModelSchemaRef(AuthorizeSignatories, {partial: true})
        }
      }
    })
    signatoryData: Partial<AuthorizeSignatories>
  ): Promise<{success: boolean; message: string; signatory: AuthorizeSignatories | null}> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});
    try {
      const companyProfile = await this.companyProfilesRepository.findOne({
        where: {
          and: [
            {usersId: currentUser.id},
            {isDeleted: false}
          ]
        }
      }, {transaction: tx});

      if (!companyProfile) {
        throw new HttpErrors.NotFound('Company not found');
      }

      const signatoryResponse = await this.authorizeSignatoriesService.updateSignatoryInfo(signatoryId, signatoryData, tx);

      await tx.commit();

      return signatoryResponse;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
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
              reason: {type: 'string'}
            }
          }
        }
      }
    })
    body: {
      status: number;
      documentId: string;
      reason?: string;
    }
  ): Promise<{success: boolean; message: string}> {
    const result = await this.userUploadDocumentsService.updateDocumentStatus(body.documentId, body.status, body.reason ?? '');

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
              reason: {type: 'string'}
            }
          }
        }
      }
    })
    body: {
      status: number;
      accountId: string;
      reason?: string;
    }
  ): Promise<{success: boolean; message: string}> {
    const result = await this.bankDetailsService.updateAccountStatus(body.accountId, body.status, body.reason ?? '');

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
              reason: {type: 'string'}
            }
          }
        }
      }
    })
    body: {
      status: number;
      signatoryId: string;
      reason?: string;
    }
  ): Promise<{success: boolean; message: string}> {
    const result = await this.authorizeSignatoriesService.updateSignatoryStatus(body.signatoryId, body.status, body.reason ?? '');

    return result;
  }
}
