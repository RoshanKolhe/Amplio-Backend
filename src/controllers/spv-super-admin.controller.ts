import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {patch, param, requestBody} from '@loopback/rest';
import {authorize} from '../authorization';
import {SpvKycDocument} from '../models';
import {SpvApplicationTransactionsService} from '../services/spv-application-transactions.service';

export class SpvSuperAdminController {
  constructor(
    @inject('service.spvApplicationTransactions.service')
    private spvApplicationTransactionsService: SpvApplicationTransactionsService,
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
}
