import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, IsolationLevel, repository} from '@loopback/repository';
import {get, getModelSchemaRef, HttpErrors, param, patch, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {BankDetails, InvestorProfile} from '../models';
import {InvestorProfileRepository, KycApplicationsRepository} from '../repositories';
import {BankDetailsService} from '../services/bank-details.service';
import {KycService} from '../services/kyc.service';
import {SessionService} from '../services/session.service';

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
  ) { }

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

      return {
        success: true,
        message: 'New Profile',
        currentProgress: currentProgress,
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
  ): Promise<{success: boolean; message: string; data: any}> {
    const steppersAllowed = [
      'investor_kyc',
      'investor_bank_details'
    ];

    if (!steppersAllowed.includes(stepperId)) {
      throw new HttpErrors.BadRequest('Invalid stepper id');
    }

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
        {relation: 'selfie', scope: {fields: {fileUrl: true, id: true, fileOriginalName: true, fileType: true}}}
      ]
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor not found');
    }

    const currentProgress = await this.getKycApplicationStatus(investorProfile.kycApplicationsId);

    if (!currentProgress.includes(stepperId)) {
      throw new HttpErrors.BadRequest('Please complete the steps');
    }

    if (stepperId === 'investor_kyc') {
      return {
        success: true,
        message: 'Documents Data',
        data: investorProfile
      }
    }

    if (stepperId === 'investor_bank_details') {
      const bankDetailsResponse = await this.bankDetailsService.fetchUserBankAccounts(investorProfile.usersId, 'investor');

      return {
        success: true,
        message: 'Bank accounts',
        data: bankDetailsResponse.accounts
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
    data: {
      count: number;
      profiles: InvestorProfile[];
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

    return {
      success: true,
      message: 'Company Profiles',
      data: {
        count: totalCount,
        profiles: investors
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
  @authorize({roles: ['company']})
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
}
