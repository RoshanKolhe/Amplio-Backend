import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {patch, post, get, param, requestBody, response} from '@loopback/rest';
import {authorize} from '../authorization';
import {CompanyKycDocument} from '../models';
import {
  CompanyKycDocumentCreatePayload,
  CompanyKycDocumentService,
} from '../services/company-kyc-document.service';

export class CompanyKycDocumentController {
  constructor(
    @inject('service.companyKycDocumentService.service')
    private companyKycDocumentService: CompanyKycDocumentService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/company-kyc-documents')
  @response(200, {
    description: 'Upload company KYC document',
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
              'companyKycDocumentRequirementsId',
              'documentsFileId',
              'mode',
              'status',
            ],
            properties: {
              usersId: {type: 'string'},
              companyKycDocumentRequirementsId: {type: 'string'},
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
    body: CompanyKycDocumentCreatePayload,
  ): Promise<{
    success: boolean;
    message: string;
    document: CompanyKycDocument;
  }> {
    return this.companyKycDocumentService.uploadDocument(body);
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/company-kyc-documents/company/{usersId}')
  @response(200, {
    description: 'Fetch company KYC documents by company profile',
  })
  async fetchByCompanyProfile(
    @param.path.string('usersId') usersId: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: CompanyKycDocument[];
  }> {
    return this.companyKycDocumentService.fetchByUser(
      usersId,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/company-kyc-documents/{documentId}/status')
  @response(200, {
    description: 'Update company KYC document verification status',
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
    return this.companyKycDocumentService.updateStatus(
      documentId,
      body.status,
      body.reason ?? '',
    );
  }
}
