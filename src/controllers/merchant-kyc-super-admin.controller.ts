import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  get,
  HttpErrors,
  param,
  patch,
  requestBody
} from '@loopback/rest';
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
import {MerchantKycDocumentService} from '../services/merchant-kyc-document.service';
import {MerchantUboDetailsService} from '../services/merchant-ubo-details.service';
import {PspService} from '../services/psp.service';


export class MerchantKycSuperAdminController {
  constructor(
    @repository(MerchantProfilesRepository)
    private merchantProfilesRepository: MerchantProfilesRepository,
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @inject('service.kyc.service')
    private kycService: KycService,
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
  ) { }

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


  //--- Merchant Profile Document Get And Patch call -----//
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/merchant-profiles/document-verification')
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
    const result = await this.merchantKycDocumentService.updateStatus(
      body.documentId,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/merchant-profiles/{merchantId}/documents')
  async fetchMerchantDocument(
    @param.path.string('merchantId') merchantId: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: MerchantKycDocument[];
  }> {
    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{id: merchantId}, {isDeleted: false}],
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    return this.merchantKycDocumentService.fetchByUser(merchantProfile.usersId);
  }

  //---- Merchant Profile Bank Get And Patch call --- //
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/merchant-profiles/{merchantId}/bank-details')
  async fetchMerchantBankDetails(
    @param.path.string('merchantId') merchantId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    const merchantProfiles = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{id: merchantId}, {isDeleted: false}],
      },
    });

    if (!merchantProfiles) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    const bankDetailsResponse =
      await this.bankDetailsService.fetchUserBankAccounts(
        merchantProfiles.usersId,
        'merchant',
      );

    return {
      success: true,
      message: 'Bank accounts',
      bankDetails: bankDetailsResponse.accounts,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/merchant-profiles/bank-account-verification')
  async merchantBankAccountVerification(
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

  //---- Merchant Profile Address Get And Patch call --- //

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/merchant-profiles/{merchantId}/address-details')
  async fetchMerchantAddressDetails(
    @param.path.string('merchantId') merchantId: string,
  ): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const merchantProfiles = await this.merchantProfilesRepository.findOne({
      where: {
        id: merchantId,
        isDeleted: false,
      },
    });

    if (!merchantProfiles) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    return this.addressDetailsService.fetchUserAddressDetails(
      merchantProfiles.usersId,
      'merchant',
      merchantProfiles.id,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/merchant-profiles/address-verification')
  async merchantAddressVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['merchantId', 'status'],
            properties: {
              merchantId: {type: 'string'},
              status: {type: 'number'}, // 1 approve, 2 reject
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      merchantId: string;
      status: number;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        id: body.merchantId,
        isDeleted: false,
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    if (body.status === 1) {
      return this.addressDetailsService.approveUserAddressDetails(
        merchantProfile.usersId,
        'merchant',
        merchantProfile.id,
      );
    }

    if (body.status === 2) {
      return this.addressDetailsService.rejectUserAddressDetails(
        merchantProfile.usersId,
        'merchant',
        merchantProfile.id,
        body.reason ?? '',
      );
    }

    throw new HttpErrors.BadRequest('Invalid status value');
  }

  //----Merchant Profile UBO Get And Patch call ---//

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/merchant-profiles/{merchantId}/ubo-details')
  async fetchMerchantUBODetails(
    @param.path.string('merchantId') merchantId: string,
    @param.filter(MerchantUboDetails) filter?: Filter<MerchantUboDetails>,
  ): Promise<{
    success: boolean;
    message: string;
    uboDetails: MerchantUboDetails[];
  }> {

    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        id: merchantId,
        isDeleted: false,
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    const merchantResponse = await this.merchantUboDetailsService.fetchMerchantUbosDetails(
      merchantProfile.usersId,
      'merchant',
      merchantProfile.id,
      filter,
    );

    return {
      success: true,
      message: 'UBO Details',
      uboDetails: merchantResponse.ubos,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/merchant-profiles/ubo-verification')
  async merchantUBOSVerification(
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
    const result = await this.merchantUboDetailsService.updateUBOSStatus(
      body.uboId,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

  //---Merchant Profile PSP Get And Patch calls ----//
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/merchant-profiles/{merchantId}/psp-details')
  async fetchMerchantPsp(
    @param.path.string('merchantId') merchantId: string,
  ): Promise<{
    success: boolean;
    message: string;
    psp: Psp[];
  }> {

    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        id: merchantId,
        isDeleted: false,
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant not found');
    }

    return this.pspService.fetchMerchantPsp(
      merchantProfile.usersId,
      merchantProfile.id,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/merchant-profiles/psp-verification')
  async merchantPspVerification(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'pspId'],
            properties: {
              status: {type: 'number'},
              pspId: {type: 'string'},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      pspId: string;
      reason?: string;
    },
  ): Promise<{success: boolean; message: string}> {
    const result = await this.pspService.updatePspStatus(
      body.pspId,
      body.status,
      body.reason ?? '',
    );

    return result;
  }

}
