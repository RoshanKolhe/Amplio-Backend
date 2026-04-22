import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {MerchantKycDocument} from '../models';
import {
  MerchantKycDocumentRepository,
  MerchantKycDocumentRequirementsRepository,
  UsersRepository,
} from '../repositories';
import {
  MerchantKycDocumentRequirementsService,
  MerchantKycRequiredDocument,
} from './merchant-kyc-document-requirements.service';
import {MediaService} from './media.service';

export interface MerchantKycDocumentStepperItem {
  documentId: string;
  documentLabel: string;
  documentValue: string;
  isMandatory: boolean;
  documentFile: {
    id: string;
    mode: number;
    status: number;
    reason?: string;
    verifiedAt?: Date;
    documentFile: {
      id: string;
      fileUrl: string;
      fileOriginalName: string;
    } | null;
  } | null;
}

export interface MerchantKycDocumentCreatePayload {
  usersId: string;
  merchantKycDocumentRequirementsId: string;
  documentsFileId: string;
  mode: number;
  status: number;
  reason?: string;
  verifiedAt?: Date;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export class MerchantKycDocumentService {
  constructor(
    @repository(MerchantKycDocumentRepository)
    private merchantKycDocumentRepository: MerchantKycDocumentRepository,
    @repository(MerchantKycDocumentRequirementsRepository)
    private merchantKycDocumentRequirementsRepository: MerchantKycDocumentRequirementsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @inject('service.merchantKycDocumentRequirementsService.service')
    private merchantKycDocumentRequirementsService: MerchantKycDocumentRequirementsService,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) {}

  private assertOwnedUserAccess(usersId: string, requesterUserId?: string) {
    if (requesterUserId && requesterUserId !== usersId) {
      throw new HttpErrors.Forbidden(
        'You are not allowed to access another merchant KYC record',
      );
    }
  }

  async fetchForKycStepper(
    usersId: string,
    requesterUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    documents: MerchantKycDocumentStepperItem[];
  }> {
    this.assertOwnedUserAccess(usersId, requesterUserId);
    const user = await this.usersRepository.findOne({
      where: {
        and: [{id: usersId}, {isDeleted: false}],
      },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    const requiredDocuments =
      await this.merchantKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    const uploadedDocuments = await this.merchantKycDocumentRepository.find({
      where: {
        and: [{usersId}, {isActive: true}, {isDeleted: false}],
      },
      include: [
        {
          relation: 'media',
          scope: {
            fields: {id: true, fileUrl: true, fileOriginalName: true},
          },
        },
      ],
      order: ['createdAt DESC'],
    });

    const uploadedByRequirementId = new Map<string, MerchantKycDocument>();
    for (const uploaded of uploadedDocuments) {
      const requirementId = uploaded.merchantKycDocumentRequirementsId;
      if (!uploadedByRequirementId.has(requirementId)) {
        uploadedByRequirementId.set(requirementId, uploaded);
      }
    }

    const documents: MerchantKycDocumentStepperItem[] = requiredDocuments.map(
      (required: MerchantKycRequiredDocument) => {
        const uploaded = uploadedByRequirementId.get(required.id);
        const media = (
          uploaded as MerchantKycDocument & {
            media?: {id: string; fileUrl: string; fileOriginalName: string};
          }
        )?.media;

        if (!uploaded) {
          return {
            documentId: required.id,
            documentLabel: required.documentLabel,
            documentValue: required.documentValue,
            isMandatory: required.isMandatory,
            documentFile: null,
          };
        }

        return {
          documentId: required.id,
          documentLabel: required.documentLabel,
          documentValue: required.documentValue,
          isMandatory: required.isMandatory,
          documentFile: {
            id: uploaded.id,
            mode: uploaded.mode,
            status: uploaded.status,
            reason: uploaded.reason,
            verifiedAt: uploaded.verifiedAt,
            documentFile: media
              ? {
                  id: media.id,
                  fileUrl: media.fileUrl,
                  fileOriginalName: media.fileOriginalName,
                }
              : null,
          },
        };
      },
    );

    return {
      success: true,
      message: 'Merchant KYC stepper documents',
      documents,
    };
  }

  async fetchByUser(usersId: string, requesterUserId?: string): Promise<{
    success: boolean;
    message: string;
    documents: MerchantKycDocument[];
  }> {
    this.assertOwnedUserAccess(usersId, requesterUserId);
    const documents = await this.merchantKycDocumentRepository.find({
      where: {
        and: [{usersId}, {isActive: true}, {isDeleted: false}],
      },
      include: [
        {
          relation: 'media',
          scope: {
            fields: {
              id: true,
              fileName: true,
              fileUrl: true,
            },
          },
        },
        {
          relation: 'merchantKycDocumentRequirements',
          scope: {
            fields: {
              id: true,
              documentLabel: true,
              documentValue: true,
              isMandatory: true,
            },
          },
        },
      ],
    });

    return {
      success: true,
      message: 'Merchant KYC documents',
      documents,
    };
  }

  async uploadDocumentsForKyc(
    usersId: string,
    documents: MerchantKycDocumentCreatePayload[],
    tx: unknown,
    requesterUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: MerchantKycDocument[];
  }> {
    this.assertOwnedUserAccess(usersId, requesterUserId);
    const user = await this.usersRepository.findOne(
      {
        where: {
          and: [{id: usersId}, {isDeleted: false}],
        },
      },
      {transaction: tx},
    );

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    for (const document of documents) {
      const documentRequirement =
        await this.merchantKycDocumentRequirementsRepository.findOne(
          {
            where: {
              and: [
                {id: document.merchantKycDocumentRequirementsId},
                {isActive: true},
                {isDeleted: false},
              ],
            },
          },
          {transaction: tx},
        );

      if (!documentRequirement) {
        throw new HttpErrors.NotFound(
          'Merchant KYC document requirement not found',
        );
      }
    }

    const uploadedDocuments: MerchantKycDocument[] = [];

    for (const document of documents) {
      const existingDoc = await this.merchantKycDocumentRepository.findOne(
        {
          where: {
            and: [
              {usersId: document.usersId},
              {
                merchantKycDocumentRequirementsId:
                  document.merchantKycDocumentRequirementsId,
              },
              {isDeleted: false},
            ],
          },
        },
        {transaction: tx},
      );

      if (existingDoc) {
        await this.merchantKycDocumentRepository.updateById(
          existingDoc.id,
          {
            documentsFileId: document.documentsFileId,
            status: document.status ?? 0,
            mode: document.mode ?? 1,
            updatedAt: new Date(),
          },
          {transaction: tx},
        );

        const updated = await this.merchantKycDocumentRepository.findById(
          existingDoc.id,
        );
        uploadedDocuments.push(updated);
        continue;
      }

      const created = await this.merchantKycDocumentRepository.create(document, {
        transaction: tx,
      });
      uploadedDocuments.push(created);
    }

    const mediaIds = documents.map(document => document.documentsFileId);
    await this.mediaService.updateMediaUsedStatus(mediaIds, true);

    return {
      success: true,
      message: 'Document uploaded',
      uploadedDocuments,
    };
  }

  async uploadDocument(
    documentPayload: MerchantKycDocumentCreatePayload,
    requesterUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    document: MerchantKycDocument;
  }> {
    this.assertOwnedUserAccess(documentPayload.usersId, requesterUserId);
    const user = await this.usersRepository.findOne({
      where: {
        and: [
          {id: documentPayload.usersId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    const documentRequirement =
      await this.merchantKycDocumentRequirementsRepository.findOne({
        where: {
          and: [
            {id: documentPayload.merchantKycDocumentRequirementsId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (!documentRequirement) {
      throw new HttpErrors.NotFound(
        'Merchant KYC document requirement not found',
      );
    }

    const document =
      await this.merchantKycDocumentRepository.create(documentPayload);

    await this.mediaService.updateMediaUsedStatus(
      [documentPayload.documentsFileId],
      true,
    );

    return {
      success: true,
      message: 'Merchant KYC document uploaded',
      document,
    };
  }

  async updateStatus(
    documentId: string,
    status: number,
    reason: string,
  ): Promise<{success: boolean; message: string}> {
    const existingDocument = await this.merchantKycDocumentRepository.findOne({
      where: {
        and: [{id: documentId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!existingDocument) {
      throw new HttpErrors.NotFound('Merchant KYC document not found');
    }

    if (![0, 1, 2].includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.merchantKycDocumentRepository.updateById(documentId, {
        status: 1,
        verifiedAt: new Date(),
      });

      return {
        success: true,
        message: 'Merchant KYC document approved',
      };
    }

    if (status === 2) {
      await this.merchantKycDocumentRepository.updateById(documentId, {
        status: 2,
        reason,
      });

      return {
        success: true,
        message: 'Merchant KYC document rejected',
      };
    }

    await this.merchantKycDocumentRepository.updateById(documentId, {
      status: 0,
      reason: '',
      verifiedAt: undefined,
    });

    return {
      success: true,
      message: 'Merchant KYC document moved to under review',
    };
  }
}
