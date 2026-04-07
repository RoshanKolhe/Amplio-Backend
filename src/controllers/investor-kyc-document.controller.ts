import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param, patch, post, requestBody, response} from '@loopback/rest';
import {authorize} from '../authorization';
import {InvestorKycDocument} from '../models';
import {
  InvestorKycDocumentCreatePayload,
  InvestorKycDocumentService,
} from '../services/investor-kyc-document.service';

export class InvestorKycDocumentController {
  constructor(
    @inject('service.investorKycDocumentService.service')
    private investorKycDocumentService: InvestorKycDocumentService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @post('/investor-kyc-documents')
  @response(200, {
    description: 'Upload investor KYC document',
  })
  async uploadDocument(
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'usersId',
              'investorKycDocumentRequirementsId',
              'documentsFileId',
              'mode',
              'status',
            ],
            properties: {
              usersId: {type: 'string'},
              investorKycDocumentRequirementsId: {type: 'string'},
              documentsFileId: {type: 'string'},
              mode: {type: 'number', enum: [0, 1]},
              status: {type: 'number', enum: [0, 1, 2]},
              reason: {type: 'string'},
              verifiedAt: {type: 'string', format: 'date-time'},
              isActive: {type: 'boolean'},
              isDeleted: {type: 'boolean'},
            },
          },
        },
      },
    })
    body: InvestorKycDocumentCreatePayload,
  ): Promise<{
    success: boolean;
    message: string;
    document: InvestorKycDocument;
  }> {
    return this.investorKycDocumentService.uploadDocument(body);
  }

  @authenticate('jwt')
  @authorize({roles: ['investor']})
  @get('/investor-kyc-documents/investor/{usersId}')
  @response(200, {
    description: 'Fetch investor KYC documents by investor profile',
  })
  async fetchByInvestorProfile(
    @param.path.string('usersId') usersId: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: InvestorKycDocument[];
  }> {
    return this.investorKycDocumentService.fetchByUser(usersId);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/investor-kyc-documents/{documentId}/status')
  @response(200, {
    description: 'Update investor KYC document verification status',
  })
  async updateStatus(
    @param.path.string('documentId') documentId: string,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status'],
            properties: {
              status: {type: 'number', enum: [0, 1, 2]},
              reason: {type: 'string'},
            },
          },
        },
      },
    })
    body: {status: number; reason?: string},
  ): Promise<{success: boolean; message: string}> {
    return this.investorKycDocumentService.updateStatus(
      documentId,
      body.status,
      body.reason ?? '',
    );
  }
}
