import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {patch,get, param, requestBody} from '@loopback/rest';
import {authorize} from '../authorization';
import {SpvApplication, SpvKycDocument} from '../models';
import {SpvApplicationTransactionsService} from '../services/spv-application-transactions.service';
import {UserProfile} from '@loopback/security';
import {Filter, repository} from '@loopback/repository';
import {SpvApplicationRepository} from '../repositories';

export class SpvSuperAdminController {
  constructor(
    @inject('service.spvApplicationTransactions.service')
    private spvApplicationTransactionsService: SpvApplicationTransactionsService,
      @repository(SpvApplicationRepository)
        private spvApplicationsRepository: SpvApplicationRepository,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/admin/spv-pre/documents/{applicationId}/{documentId}')
  async updateDocumentById(
    @param.path.string('applicationId') applicationId: string,
    @param.path.string('documentId') documentId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              mediaId: {type: 'string'},
              isAccepted: {type: 'boolean'},
              reason: {type: 'string'},
              status: {type: 'number'},
              sequenceOrder: {type: 'number'},
              trusteeSignStatus: {
                type: 'string',
                enum: ['not_required', 'locked', 'pending', 'signed'],
              },
              trusteeSignedAt: {type: 'string', format: 'date-time'},
            },
          },
        },
      },
    })
    payload: Partial<
      Pick<
        SpvKycDocument,
        | 'mediaId'
        | 'isAccepted'
        | 'reason'
        | 'status'
        | 'sequenceOrder'
        | 'trusteeSignStatus'
        | 'trusteeSignedAt'
      >
    >,
  ) {
    const details =
      await this.spvApplicationTransactionsService.updateDocumentByIdForAdmin(
        applicationId,
        documentId,
        payload,
      );

    return {
      success: true,
      message: 'SPV document updated by super admin',
      details,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/admin/spv-pre/applications/{applicationId}/verification')
  async verifyApplication(
    @param.path.string('applicationId') applicationId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status'],
            properties: {
              status: {type: 'number', enum: [1, 2]},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      status: number;
      reason?: string;
    },
  ) {
    const details =
      await this.spvApplicationTransactionsService.verifyApplicationByAdmin(
        applicationId,
        body.status,
        body.reason ?? '',
      );

    return {
      success: true,
      message: 'SPV application verification updated',
      details,
    };
  }


    @authenticate('jwt')
    @authorize({roles: ['super_admin']})
    @get('/super-admin/spv-applications')
    async getSpvApplications(
      @param.filter(SpvApplication) filter?: Filter<SpvApplication>,
      @param.query.number('status') status?: number,
    ): Promise<{
      success: boolean;
      message: string;
      data: SpvApplication[];
      count: {
        totalCount: number
      }
    }> {
      let rootWhere = {
        ...filter?.where,
      };


      const spvApplications = await this.spvApplicationsRepository.find({
        ...filter,
        where: rootWhere,
        limit: filter?.limit ?? 10,
        skip: filter?.skip ?? 0,

        order: filter?.order ?? ['createdAt DESC'],

      });

      const totalCount = (await this.spvApplicationsRepository.count(filter?.where)).count;

      return {
        success: true,
        message: 'SPV Applications',
        data: spvApplications,
        count: {
          totalCount: totalCount,

        }
      };
    }



}
