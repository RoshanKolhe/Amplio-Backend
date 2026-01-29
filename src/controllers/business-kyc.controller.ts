import {
  authenticate,
  AuthenticationBindings,
} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {get, getModelSchemaRef, HttpErrors, param, patch, post, requestBody} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {BusinessKycProfile} from '../models';
import {
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';
import {BusinessKycStatusService} from '../services/businees-kyc-status.service';
import {BusinessKycProfileDetailsService} from '../services/business-kyc-profile-details.service';
import {BusinessKycStatusDataService} from '../services/business-kyc-status-data.service';

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
    private businessKycStatusDataService: BusinessKycStatusDataService
  ) { }


  async verifyCompany(usersId: string) {
    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        and: [
          {usersId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('No Company found');
    }

    return companyProfile;
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc')
  async startBusinessKyc(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      businessKycId: string;
      companyProfileId: string;
      status: string;
      activeStep: {
        id: string;
        label: string;
        code: string;
      };
      completedSteps: {id: string; label: string; code: string}[];
    };
  }> {
    const status = await this.statusService.fetchInitialStatus();

    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('No company profile found for this user');
    }

    const companyProfileId = companyProfile.id;

    const kyc = await this.businessKycRepository.create({
      companyProfilesId: companyProfileId,
      businessKycStatusMasterId: status.id,
      status: status.value,
      isActive: true,
      isDeleted: false,
    });

    return {
      success: true,
      message: 'Business KYC started successfully',
      data: {
        businessKycId: kyc.id!,
        companyProfileId: kyc.companyProfilesId,
        status: kyc.status ?? 'IN_PROGRESS',
        activeStep: {
          id: status.id,
          label: status.status,
          code: status.value,
        },
        completedSteps: [
          {
            id: status.id,
            label: status.status,
            code: status.value,
          },
        ],
      },
    };
  }

  @get('/business-kyc/company/{companyProfileId}')
  async fetchBusinessKycStateByCompany(
    @param.path.string('companyProfileId') companyProfileId: string,
  ) {
    const kyc = await this.businessKycRepository.findOne({
      where: {
        and: [
          {companyProfilesId: companyProfileId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not started for this company');
    }

    const currentStatus =
      await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!
      );

    const completedSteps =
      await this.statusService.fetchCompletedStepsSequence(
        currentStatus.sequenceOrder
      );

    return {
      success: true,
      data: {
        businessKycId: kyc.id,
        companyProfileId,
        completedSteps,
        activeStep: {
          id: currentStatus.id,
          label: currentStatus.status,
          code: currentStatus.value,
        },
      },
    };
  }



  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/business-kyc/{businessKycId}/data-by-status/{statusValue}')
  async fetchDataByStatusValue(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('businessKycId') businessKycId: string,
    @param.path.string('statusValue') statusValue: string,
  ) {
    const company = await this.verifyCompany(currentUser.id);

    const kyc = await this.businessKycRepository.findOne({
      where: {
        id: businessKycId,
        companyProfilesId: company.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not found');
    }

    const currentStatus =
      await this.statusService.fetchApplicationStatusById(
        kyc.businessKycStatusMasterId!,
      );

    const requestedStatus =
      await this.statusService.verifyStatusValue(statusValue);

    if (requestedStatus.sequenceOrder > currentStatus.sequenceOrder) {
      throw new HttpErrors.BadRequest('This step is not completed yet');
    }

    const data = await this.businessKycStatusDataService.fetchDataWithStatus(
      businessKycId,
      requestedStatus.value,
    );

    return {
      success: true,
      message: 'KYC step data',
      stepData: data,
    };
  }


  ///// BUSINESSS KYC PROFILE //////

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/business-kyc/{businessKycId}/profile-details')
  async updateProfileDetails(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
    @param.path.string('businessKycId')
    businessKycId: string,

    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['profileDetails'],
            properties: {
              profileDetails: {
                type: 'array',
                minItems: 1,
                items: getModelSchemaRef(BusinessKycProfile, {
                  title: 'CreateBusinessKycPrfileDetails',
                  exclude: ['id', 'businessKycId'],
                }),
              },
            },
          },
        },
      },
    })
    body: {
      profileDetails: Omit<BusinessKycProfile, 'id' | 'businessKycId'>[];
    },
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      businessKycId: string;
      profileDetails: BusinessKycProfile[];
      updateStatus: boolean;
    };
  }> {
    await this.verifyCompany(currentUser.id);

    const result =
      await this.businessKycProfileDetailsService.createOrUpdateBusinessKycProfileDetails(
        businessKycId,
        body.profileDetails,
        null, // tx (optional)
      );

    return {
      success: true,
      message: 'Borrowing details updated successfully',
      data: {
        businessKycId,
        profileDetails: result.profileDetails,
        updateStatus: result.updateStatus,
      },
    };
  }




}
