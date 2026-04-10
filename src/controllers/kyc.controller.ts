import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors, patch, requestBody, SchemaObject} from '@loopback/rest';
import {authorize} from '../authorization';
import {KycApplicationsRepository} from '../repositories';
import {KycService} from '../services/kyc.service';

const handleKycApplicationRequestSchema: SchemaObject = {
  oneOf: [
    {
      type: 'object',
      required: ['applicationId', 'status'],
      properties: {
        applicationId: {type: 'string'},
        status: {type: 'number', enum: [2]},
        reason: {type: 'string'},
        rejectReason: {type: 'string'},
      },
    },
    {
      type: 'object',
      required: ['applicationId', 'status', 'rejectReason'],
      properties: {
        applicationId: {type: 'string'},
        status: {type: 'number', enum: [3]},
        reason: {type: 'string'},
        rejectReason: {type: 'string', minLength: 1},
      },
    },
    {
      type: 'object',
      required: ['applicationId', 'status', 'reason'],
      properties: {
        applicationId: {type: 'string'},
        status: {type: 'number', enum: [3]},
        reason: {type: 'string', minLength: 1},
        rejectReason: {type: 'string'},
      },
    },
  ],
};

export class KycControllerController {
  constructor(
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @inject('service.kyc.service')
    private kycService: KycService,
  ) { }

  // ------------------------------------------Approve KYC--------------------------------------------

  
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/kyc/handle-kyc-application')
  async handleKYCApplication(
    @requestBody({
      content: {
        'application/json': {
          schema: handleKycApplicationRequestSchema,
        }
      }
    })
    body: {
      applicationId: string;
      status: number;
      reason?: string;
      rejectReason?: string;
    }
  ): Promise<{success: boolean; message: string}> {
    const rejectionReason = body.rejectReason ?? body.reason;

    if (body.status === 3 && !rejectionReason?.trim()) {
      throw new HttpErrors.BadRequest(
        'rejectReason is required when rejecting a KYC application',
      );
    }

    const tx = await this.kycApplicationsRepository.dataSource.beginTransaction({
      isolationLevel: 'READ COMMITTED',
    });

    try {
      const kycApplication = await this.kycApplicationsRepository.findOne(
        {
          where: {
            and: [
              {id: body.applicationId},
              {isActive: true},
              {isDeleted: false}
            ]
          },
          order: ['createdAt DESC']
        },
        {transaction: tx}
      );

      if (!kycApplication) {
        throw new HttpErrors.NotFound('No KYC application found');
      }

      let result;

      if (kycApplication.roleValue === 'company') {
        result = await this.kycService.handleCompanyKycApplication(
          kycApplication.id,
          kycApplication.identifierId,
          body.status,
          rejectionReason ?? '',
          tx
        );

        await tx.commit();
        return {
          success: true,
          message: result.message
        };
      }

      if (kycApplication.roleValue === 'trustee') {
        result = await this.kycService.handleTrusteeKycApplication(
          kycApplication.id,
          kycApplication.identifierId,
          body.status,
          rejectionReason ?? '',
          tx
        );

        await tx.commit();
        return {
          success: true,
          message: result.message
        };
      }

      if (kycApplication.roleValue === 'investor') {
        result = await this.kycService.handleInvestorKycApplication(
          kycApplication.id,
          kycApplication.identifierId,
          body.status,
          rejectionReason ?? '',
          tx
        );

        await tx.commit();
        return {
          success: true,
          message: result.message
        };
      }

      if (kycApplication.roleValue === 'merchant') {
        result = await this.kycService.handleMerchantKycApplication(
          kycApplication.id,
          kycApplication.identifierId,
          body.status,
          rejectionReason ?? '',
          tx
        );

        await tx.commit();
        return {
          success: true,
          message: result.message
        };
      }

      throw new HttpErrors.BadRequest('Invalid role value');

    } catch (error) {
      await tx.rollback();
      console.log('error in kyc applications :', error);
      throw error;
    }
  }
}
