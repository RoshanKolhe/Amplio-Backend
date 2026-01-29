import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {IsolationLevel, repository} from '@loopback/repository';
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
import {BusinessKycAuditedFinancials, CompanyProfiles} from '../models';
import {
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';
import {BusinessKycStatusService} from '../services/businees-kyc-status.service';
import {BusinessKycProfileDetailsService} from '../services/business-kyc-profile-details.service';
import {BusinessKycStatusDataService} from '../services/business-kyc-status-data.service';
import {BusinessKycStateService} from '../services/business-kyc-state.service';
import {BusinessKycStepDataService} from '../services/business-kyc-step-data.service';
import {BusinessKycAuditedFinancialsService} from '../services/business-kyc-audited-financials.service';

export class BusinessKycController {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,
    @repository(CompanyProfilesRepository)
    private companyProfileRepository: CompanyProfilesRepository,
    @inject('service.businessKycStatusService.service')
    private statusService: BusinessKycStatusService,
    @inject('service.businessKycProfileDetailsService.service')
    private businessKycProfileDetailsService: BusinessKycProfileDetailsService,
    @inject('service.businessKycStatusDataService.service')
    private businessKycStatusDataService: BusinessKycStatusDataService,
    @inject('service.businessKycStateService.service')
    private businessKycStateService: BusinessKycStateService,
    @inject('service.businessKycStepDataService')
    private businessKycStepDataService: BusinessKycStepDataService,
    @inject('service.businessKycAuditedFinancialsService.service')
    private businessKycAuditedFinancialsService: BusinessKycAuditedFinancialsService,
  ) {}

  async verifyCompany(usersId: string): Promise<CompanyProfiles> {
    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        and: [{usersId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('No Company found');
    }

    return companyProfile;
  }

  // unnecessary status, active step, completed steps fields we can just pass active step
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc')
  async startBusinessKyc(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
  ) {
    const status = await this.statusService.fetchInitialStatus();

    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        usersId: currentUser.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('No company profile found for this user');
    }

    // 🔑 KEY PART: check existing KYC
    let kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    // create only if not exists
    if (!kyc) {
      kyc = await this.businessKycRepository.create({
        companyProfilesId: companyProfile.id,
        businessKycStatusMasterId: status.id,
        status: status.value,
        isActive: true,
        isDeleted: false,
      });
    }

    return {
      success: true,
      message: 'Business KYC status fetched successfully',
      data: {
        businessKycId: kyc.id!,
        companyProfileId: companyProfile.id,
        activeStep: {
          id: kyc.businessKycStatusMasterId,
          label: status.status,
          code: kyc.status,
        },
      },
    };
  }

  // access token is missing invalid params are passing no need of company profile id.
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/business-kyc/state')
  async fetchBusinessKycState(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
  ) {
    const data =
      await this.businessKycStateService.fetchStateByUser(currentUser);
    return {
      success: true,
      data,
    };
  }

  // here no need business kyc id
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/business-kyc/data-by-status/{statusValue}')
  async fetchDataByStatusValue(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,

    @param.path.string('statusValue')
    statusValue: string,
  ) {
    const result = await this.businessKycStepDataService.fetchStepDataByStatus(
      currentUser,
      statusValue,
    );

    return {
      success: true,
      message: 'KYC step data fetched successfully',
      step: result.step,
      data: result.data,
    };
  }

  ///// BUSINESSS KYC PROFILE //////
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/business-kyc/profile-details')
  async updateProfileDetails(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,

    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['yearInBusiness', 'turnover', 'projectedTurnover'],
            properties: {
              yearInBusiness: {type: 'number'},
              turnover: {type: 'number'},
              projectedTurnover: {type: 'number'},
            },
          },
        },
      },
    })
    body: {
      yearInBusiness: number;
      turnover: number;
      projectedTurnover: number;
    },
  ) {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const companyProfile = await this.companyProfileRepository.findOne({
        where: {
          usersId: currentUser.id,
          isActive: true,
          isDeleted: false,
        },
      });

      if (!companyProfile) {
        throw new HttpErrors.NotFound('Company profile not found');
      }

      const kyc = await this.businessKycRepository.findOne({
        where: {
          companyProfilesId: companyProfile.id,
          isActive: true,
          isDeleted: false,
        },
      });

      if (!kyc) {
        throw new HttpErrors.NotFound('Business KYC not started');
      }

      const result =
        await this.businessKycProfileDetailsService.createOrUpdateBusinessKycProfileDetails(
          kyc.id!,
          body, // ✅ PASS FLAT OBJECT
          tx,
        );

      await tx.commit();

      return {
        success: true,
        message: 'Business profile details updated successfully',
        data: {
          profileDetails: result.profileDetails,
          updateStatus: result.updateStatus,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // update audited financials...
  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/bonds-pre-issue/audited-financials')
  async updateAuditedFinancials(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['auditedFinancials'],
            properties: {
              auditedFinancials: {
                type: 'array',
                minItems: 1,
                items: getModelSchemaRef(BusinessKycAuditedFinancials, {
                  title: 'CreateBondAuditedFinancial',
                  exclude: ['id'],
                }),
              },
            },
          },
        },
      },
    })
    financials: {
      auditedFinancials: Omit<BusinessKycAuditedFinancials, 'id'>[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    details: {
      businessKycId: string;
      auditedFinancials: BusinessKycAuditedFinancials[];
      isUpdated: boolean;
    };
  }> {
    const tx = await this.businessKycRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });
    const company = await this.verifyCompany(currentUser.id);

    const kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: company.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not started');
    }

    const result =
      await this.businessKycAuditedFinancialsService.createOrUpdateAuditedFinancials(
        kyc.id!,
        financials.auditedFinancials,
        tx,
      );

    return {
      success: true,
      message: 'Audited financials updated',
      details: {
        businessKycId: kyc.id!,
        auditedFinancials: result?.auditedFinancials,
        isUpdated: result?.isUpdated,
      },
    };
  }
}
