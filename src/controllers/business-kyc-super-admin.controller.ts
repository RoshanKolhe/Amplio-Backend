// Uncomment these imports to begin using these cool features!

// import {inject} from '@loopback/core';

import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {get, HttpErrors, param, patch, requestBody} from '@loopback/rest';
import {authorize} from '../authorization';
import { } from '../models';
import {BusinessKycRepository, CompanyProfilesRepository} from '../repositories';
import {BusinessKycAuditedFinancialsService} from '../services/business-kyc-audited-financials.service';
import {BusinessKycCollateralAssetsService} from '../services/business-kyc-collateral-assets.service';
import {BusinessKycGuarantorDetailsService} from '../services/business-kyc-guarantor-details.service';
import {BusinessKycProfileDetailsService} from '../services/business-kyc-profile-details.service';


export class BusinessKycSuperAdminController {
  constructor(

    @repository(CompanyProfilesRepository)
    private companyProfilesRepository: CompanyProfilesRepository,
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,
    @inject('service.businessKycProfileDetailsService.service')
    private businessKycProfileDetailsService: BusinessKycProfileDetailsService,
    @inject('service.businessKycAuditedFinancialsService.service')
    private businessKycAuditedFinancialsService: BusinessKycAuditedFinancialsService,
    @inject('service.businessKycCollateralAssetsService.service')
    private businessKycCollateralAssetsService: BusinessKycCollateralAssetsService,
    @inject('service.businessKycGuarantorDetailsService')
    private businessKycGuarantorDetailsService: BusinessKycGuarantorDetailsService
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/business-profile')
  async fetchCompanyBusinessProfileDetails(
    @param.path.string('companyId') companyId: string,
  ): Promise<{success: boolean; message: string; data: any}> {

    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        id: companyId,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const businessKyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!businessKyc) {
      return {
        success: true,
        message: 'No Business KYC found',
        data: [],
      };
    }

    if (!businessKyc.id) {
      throw new HttpErrors.InternalServerError(
        'Business KYC ID is missing',
      );
    }

    const businessKycProfile =
      await this.businessKycProfileDetailsService.fetchBusinessKycProfileDetails(
        businessKyc.id,
      );


    return {
      success: true,
      message: 'Business kyc fetched successfully',
      data: businessKycProfile,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/collateral-details')
  async fetchCompanyCollateralAssetsDetails(
    @param.path.string('companyId') companyId: string,
  ): Promise<{success: boolean; message: string; data: any}> {

    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        id: companyId,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const businessKyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!businessKyc) {
      return {
        success: true,
        message: 'No Business KYC found',
        data: [],
      };
    }

    if (!businessKyc.id) {
      throw new HttpErrors.InternalServerError(
        'Business KYC ID is missing',
      );
    }

    const collateralAssets =
      await this.businessKycCollateralAssetsService.fetchBusinessKycCollateralAssets(
        businessKyc.id,
      );


    return {
      success: true,
      message: 'Collateral assets fetched successfully',
      data: collateralAssets,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/audited-financials')
  async fetchCompanyAuditedFinancialsDetails(
    @param.path.string('companyId') companyId: string,
  ): Promise<{success: boolean; message: string; data: any}> {

    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        id: companyId,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const businessKyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!businessKyc) {
      return {
        success: true,
        message: 'No Business KYC found',
        data: [],
      };
    }

    if (!businessKyc.id) {
      throw new HttpErrors.InternalServerError(
        'Business KYC ID is missing',
      );
    }

    const collateralAssets =
      await this.businessKycAuditedFinancialsService.fetchAuditedFinancials(
        businessKyc.id,
      );


    return {
      success: true,
      message: 'Audited financial fetched successfully',
      data: collateralAssets,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/company-profiles/{companyId}/guarantor-details')
  async fetchCompanyGuarantorDetailsDetails(
    @param.path.string('companyId') companyId: string,
  ): Promise<{success: boolean; message: string; data: any}> {

    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        id: companyId,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company not found');
    }

    const businessKyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!businessKyc) {
      return {
        success: true,
        message: 'No Business KYC found',
        data: [],
      };
    }

    if (!businessKyc.id) {
      throw new HttpErrors.InternalServerError(
        'Business KYC ID is missing',
      );
    }

    const businessKycProfile =
      await this.businessKycGuarantorDetailsService.getGuarantorsByBusinessKycId(
        businessKyc.id,
      );


    return {
      success: true,
      message: 'Guarantor details fetched successfully',
      data: businessKycProfile,
    };
  }


  // Business Kyc Approvel Apis //

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-profiles/business-profile-verification')
  async comapnyBusinessProfileVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'id'],
            properties: {
              status: {type: 'number'},
              id: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      id: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const result = await this.businessKycProfileDetailsService.updateBusinessProfileStatus(
      body.id,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

  // Audited Financial Remaining

  @authenticate('jwt')
@authorize({roles: ['super_admin']})
@patch('/company-profiles/audited-financial-verification')
async companyAuditedFinancialVerification(
  @requestBody({
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['status', 'companyProfilesId'],
          properties: {
            status: {type: 'number'},        // 1 approve, 2 reject
            companyProfilesId: {type: 'string'},
            reason: {type: 'string'},
          },
        },
      },
    },
  })
  body: {
    status: number;
    companyProfilesId: string;
    reason?: string;
  },
): Promise<{success: boolean; message: string}> {

  return this.businessKycAuditedFinancialsService
    .updateAuditedFinancialsStatusByCompany(
      body.companyProfilesId,
      body.status,
      body.reason ?? '',
    );
}


  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-profiles/guarantor-profile-verification')
  async comapnyGuarantorProfileVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'id'],
            properties: {
              status: {type: 'number'},
              id: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      id: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const result = await this.businessKycGuarantorDetailsService.updateGuarantorDetailsStatus(
      body.id,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-profiles/collateral-assets-verification')
  async comapnyCollateralAssetsVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'id'],
            properties: {
              status: {type: 'number'},
              id: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      id: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const result = await this.businessKycCollateralAssetsService.updateCollateralAssetsStatus(
      body.id,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

}
