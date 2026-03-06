import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {CompanyKycDocument} from '../models';
import {
  CompanyKycDocumentRepository,
  CompanyKycDocumentRequirementsRepository,
  UsersRepository,
} from '../repositories';
import {
  CompanyKycDocumentRequirementsService,
  CompanyKycRequiredDocument,
} from './company-kyc-document-requirements.service';
import {MediaService} from './media.service';

export interface CompanyKycDocumentStepperItem {
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

export interface CompanyKycDocumentCreatePayload {
  usersId: string;
  companyKycDocumentRequirementsId: string;
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

export class CompanyKycDocumentService {
  constructor(
    @repository(CompanyKycDocumentRepository)
    private companyKycDocumentRepository: CompanyKycDocumentRepository,
    @repository(CompanyKycDocumentRequirementsRepository)
    private companyKycDocumentRequirementsRepository: CompanyKycDocumentRequirementsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @inject('service.companyKycDocumentRequirementsService.service')
    private companyKycDocumentRequirementsService: CompanyKycDocumentRequirementsService,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) { }

  async fetchForKycStepper(usersId: string): Promise<{
    success: boolean;
    message: string;
    documents: CompanyKycDocumentStepperItem[];
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
      await this.companyKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadedDocuments: any[] =
      await this.companyKycDocumentRepository.find({
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

    // Keep only latest upload per requirement id.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadedByRequirementId = new Map<string, any>();
    for (const uploaded of uploadedDocuments) {
      const requirementId = uploaded.companyKycDocumentRequirementsId;
      if (!uploadedByRequirementId.has(requirementId)) {
        uploadedByRequirementId.set(requirementId, uploaded);
      }
    }

    const documents: CompanyKycDocumentStepperItem[] = requiredDocuments.map(
      (required: CompanyKycRequiredDocument) => {
        const uploaded = uploadedByRequirementId.get(required.id);

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
            documentFile: uploaded.media
              ? {
                id: uploaded.media.id,
                fileUrl: uploaded.media.fileUrl,
                fileOriginalName: uploaded.media.fileOriginalName,
              }
              : null,
          },
        };
      },
    );

    return {
      success: true,
      message: 'Company KYC stepper documents',
      documents,
    };
  }

  async fetchByUser(usersId: string): Promise<{
    success: boolean;
    message: string;
    documents: CompanyKycDocument[];
  }> {
    const documents = await this.companyKycDocumentRepository.find({
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
          relation: 'companyKycDocumentRequirements',
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
      // order: ['createdAt DESC'],
    });

    return {
      success: true,
      message: 'Company KYC documents',
      documents,
    };
  }

  async uploadDocumentsForKyc(
    usersId: string,
    documents: CompanyKycDocumentCreatePayload[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: CompanyKycDocument[];
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
        await this.companyKycDocumentRequirementsRepository.findOne(
          {
            where: {
              and: [
                {id: document.companyKycDocumentRequirementsId},
                {isActive: true},
                {isDeleted: false},
              ],
            },
          },
          {transaction: tx},
        );

      if (!documentRequirement) {
        throw new HttpErrors.NotFound(
          'Company KYC document requirement not found',
        );
      }
    }

    const uploadedDocuments: CompanyKycDocument[] = [];

    for (const document of documents) {

      const existingDoc = await this.companyKycDocumentRepository.findOne(
        {
          where: {
            and: [
              {usersId: document.usersId},
              {companyKycDocumentRequirementsId: document.companyKycDocumentRequirementsId},
              {isDeleted: false},
            ],
          },
        },
        {transaction: tx},
      );

      if (existingDoc) {
        await this.companyKycDocumentRepository.updateById(
          existingDoc.id,
          {
            documentsFileId: document.documentsFileId,
            status: document.status ?? 0,
            mode: document.mode ?? 1,
            updatedAt: new Date(),
          },
          {transaction: tx},
        );

        const updated = await this.companyKycDocumentRepository.findById(existingDoc.id, {
        });

        uploadedDocuments.push(updated);

      } else {

        const created = await this.companyKycDocumentRepository.create(
          document,
          {transaction: tx},
        );

        uploadedDocuments.push(created);
      }
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
    documentPayload: CompanyKycDocumentCreatePayload,
  ): Promise<{
    success: boolean;
    message: string;
    document: CompanyKycDocument;
  }> {
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
      await this.companyKycDocumentRequirementsRepository.findOne({
        where: {
          and: [
            {id: documentPayload.companyKycDocumentRequirementsId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (!documentRequirement) {
      throw new HttpErrors.NotFound(
        'Company KYC document requirement not found',
      );
    }

    const document =
      await this.companyKycDocumentRepository.create(documentPayload);

    await this.mediaService.updateMediaUsedStatus(
      [documentPayload.documentsFileId],
      true,
    );

    return {
      success: true,
      message: 'Company KYC document uploaded',
      document,
    };
  }

  async updateStatus(
    documentId: string,
    status: number,
    reason: string,
  ): Promise<{success: boolean; message: string}> {
    const existingDocument = await this.companyKycDocumentRepository.findOne({
      where: {
        and: [{id: documentId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!existingDocument) {
      throw new HttpErrors.NotFound('Company KYC document not found');
    }

    if (![0, 1, 2].includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.companyKycDocumentRepository.updateById(documentId, {
        status: 1,
        verifiedAt: new Date(),
      });

      return {
        success: true,
        message: 'Company KYC document approved',
      };
    }

    if (status === 2) {
      await this.companyKycDocumentRepository.updateById(documentId, {
        status: 2,
        reason,
      });

      return {
        success: true,
        message: 'Company KYC document rejected',
      };
    }

    await this.companyKycDocumentRepository.updateById(documentId, {
      status: 0,
      reason: '',
      verifiedAt: undefined,
    });

    return {
      success: true,
      message: 'Company KYC document moved to under review',
    };
  }
}
