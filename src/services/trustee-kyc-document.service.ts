import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {TrusteeKycDocument} from '../models';
import {
  TrusteeKycDocumentRepository,
  TrusteeKycDocumentRequirementsRepository,
  UsersRepository,
} from '../repositories';
import {
  TrusteeKycDocumentRequirementsService,
  TrusteeKycRequiredDocument,
} from './trustee-kyc-document-requirements.service';
import {MediaService} from './media.service';

export interface TrusteeKycDocumentStepperItem {
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

export interface TrusteeKycDocumentCreatePayload {
  usersId: string;
  trusteeKycDocumentRequirementsId: string;
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

export class TrusteeKycDocumentService {
  constructor(
    @repository(TrusteeKycDocumentRepository)
    private trusteeKycDocumentRepository: TrusteeKycDocumentRepository,
    @repository(TrusteeKycDocumentRequirementsRepository)
    private trusteeKycDocumentRequirementsRepository: TrusteeKycDocumentRequirementsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @inject('service.trusteeKycDocumentRequirementsService.service')
    private trusteeKycDocumentRequirementsService: TrusteeKycDocumentRequirementsService,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) {}

  async fetchForKycStepper(usersId: string): Promise<{
    success: boolean;
    message: string;
    documents: TrusteeKycDocumentStepperItem[];
  }> {
    const user = await this.usersRepository.findOne({
      where: {
        and: [{id: usersId}, {isDeleted: false}],
      },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    const requiredDocuments =
      await this.trusteeKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    const uploadedDocuments = await this.trusteeKycDocumentRepository.find({
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

    const uploadedByRequirementId = new Map<string, TrusteeKycDocument>();
    for (const uploaded of uploadedDocuments) {
      const requirementId = uploaded.trusteeKycDocumentRequirementsId;
      if (!uploadedByRequirementId.has(requirementId)) {
        uploadedByRequirementId.set(requirementId, uploaded);
      }
    }

    const documents: TrusteeKycDocumentStepperItem[] = requiredDocuments.map(
      (required: TrusteeKycRequiredDocument) => {
        const uploaded = uploadedByRequirementId.get(required.id);
        const media = (
          uploaded as TrusteeKycDocument & {
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
      message: 'Trustee KYC stepper documents',
      documents,
    };
  }

  async fetchByUser(usersId: string): Promise<{
    success: boolean;
    message: string;
    documents: TrusteeKycDocument[];
  }> {
    const documents = await this.trusteeKycDocumentRepository.find({
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
          relation: 'trusteeKycDocumentRequirements',
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
      message: 'Trustee KYC documents',
      documents,
    };
  }

  async fetchById(documentId: string): Promise<{
    success: boolean;
    message: string;
    document: TrusteeKycDocument;
  }> {
    const document = await this.trusteeKycDocumentRepository.findOne({
      where: {
        and: [{id: documentId}, {isActive: true}, {isDeleted: false}],
      },
      include: [
        {
          relation: 'media',
          scope: {
            fields: {id: true, fileOriginalName: true, fileUrl: true},
          },
        },
        {
          relation: 'trusteeKycDocumentRequirements',
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

    if (!document) {
      throw new HttpErrors.NotFound('Trustee KYC document not found');
    }

    return {
      success: true,
      message: 'Trustee KYC document',
      document,
    };
  }

  async uploadDocumentsForKyc(
    usersId: string,
    documents: TrusteeKycDocumentCreatePayload[],
    tx: unknown,
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: TrusteeKycDocument[];
  }> {
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
        await this.trusteeKycDocumentRequirementsRepository.findOne(
          {
            where: {
              and: [
                {id: document.trusteeKycDocumentRequirementsId},
                {isActive: true},
                {isDeleted: false},
              ],
            },
          },
          {transaction: tx},
        );

      if (!documentRequirement) {
        throw new HttpErrors.NotFound(
          'Trustee KYC document requirement not found',
        );
      }
    }

    const uploadedDocuments: TrusteeKycDocument[] = [];

    for (const document of documents) {
      const existingDoc = await this.trusteeKycDocumentRepository.findOne(
        {
          where: {
            and: [
              {usersId: document.usersId},
              {
                trusteeKycDocumentRequirementsId:
                  document.trusteeKycDocumentRequirementsId,
              },
              {isDeleted: false},
            ],
          },
        },
        {transaction: tx},
      );

      if (existingDoc) {
        await this.trusteeKycDocumentRepository.updateById(
          existingDoc.id,
          {
            documentsFileId: document.documentsFileId,
            status: document.status ?? 0,
            mode: document.mode ?? 1,
            updatedAt: new Date(),
          },
          {transaction: tx},
        );

        const updated = await this.trusteeKycDocumentRepository.findById(
          existingDoc.id,
        );
        uploadedDocuments.push(updated);
        continue;
      }

      const created = await this.trusteeKycDocumentRepository.create(document, {
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

  async updateStatus(
    documentId: string,
    status: number,
    reason: string,
  ): Promise<{success: boolean; message: string}> {
    const existingDocument = await this.trusteeKycDocumentRepository.findOne({
      where: {
        and: [{id: documentId}, {isDeleted: false}],
      },
    });

    if (!existingDocument) {
      throw new HttpErrors.NotFound('Trustee KYC document not found');
    }

    if (status === 1) {
      await this.trusteeKycDocumentRepository.updateById(documentId, {
        status: 1,
        verifiedAt: new Date(),
      });
      return {
        success: true,
        message: 'Trustee KYC document approved',
      };
    }

    if (status === 2) {
      await this.trusteeKycDocumentRepository.updateById(documentId, {
        status: 2,
        reason,
      });
      return {
        success: true,
        message: 'Trustee KYC document rejected',
      };
    }

    await this.trusteeKycDocumentRepository.updateById(documentId, {
      status: 0,
      reason,
    });

    return {
      success: true,
      message: 'Trustee KYC document moved to under review',
    };
  }
}
