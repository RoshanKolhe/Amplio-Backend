import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, HttpErrors, param, patch, post, requestBody, response} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {MerchantKycDocument} from '../models';
import {
  MerchantKycDocumentCreatePayload,
  MerchantKycDocumentService,
} from '../services/merchant-kyc-document.service';

export class MerchantKycDocumentController {
  constructor(
    @inject('service.merchantKycDocumentService.service')
    private merchantKycDocumentService: MerchantKycDocumentService,
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @post('/merchant-kyc-documents')
  @response(200, {
    description: 'Upload merchant KYC document',
  })
  async uploadDocument(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'usersId',
              'merchantKycDocumentRequirementsId',
              'documentsFileId',
              'mode',
              'status',
            ],
            properties: {
              usersId: {type: 'string'},
              merchantKycDocumentRequirementsId: {type: 'string'},
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
    body: MerchantKycDocumentCreatePayload,
  ): Promise<{
    success: boolean;
    message: string;
    document: MerchantKycDocument;
  }> {
    if (body.usersId && body.usersId !== currentUser.id) {
      throw new HttpErrors.Forbidden(
        'You can only upload documents for your own merchant account',
      );
    }

    return this.merchantKycDocumentService.uploadDocument(
      {
        ...body,
        usersId: currentUser.id,
      },
      currentUser.id,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/merchant-kyc-documents/merchant/{usersId}')
  @response(200, {
    description: 'Fetch merchant KYC documents by merchant profile',
  })
  async fetchByMerchantProfile(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('usersId') usersId: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: MerchantKycDocument[];
  }> {
    if (usersId !== currentUser.id) {
      throw new HttpErrors.Forbidden(
        'You can only fetch documents for your own merchant account',
      );
    }

    return this.merchantKycDocumentService.fetchByUser(usersId, currentUser.id);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/merchant-kyc-documents/{documentId}/status')
  @response(200, {
    description: 'Update merchant KYC document verification status',
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
    return this.merchantKycDocumentService.updateStatus(
      documentId,
      body.status,
      body.reason ?? '',
    );
  }
}
