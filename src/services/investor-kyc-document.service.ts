import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {InvestorKycDocument} from '../models';
import {
  InvestorKycDocumentRepository,
  InvestorKycDocumentRequirementsRepository,
  UsersRepository,
} from '../repositories';
import {
  InvestorKycDocumentRequirementsService,
  InvestorKycRequiredDocument,
} from './investor-kyc-document-requirements.service';
import {MediaService} from './media.service';

export interface InvestorKycDocumentStepperItem {
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

export interface InvestorKycDocumentCreatePayload {
  usersId: string;
  investorKycDocumentRequirementsId: string;
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

export class InvestorKycDocumentService {
  constructor(
    @repository(InvestorKycDocumentRepository)
    private investorKycDocumentRepository: InvestorKycDocumentRepository,
    @repository(InvestorKycDocumentRequirementsRepository)
    private investorKycDocumentRequirementsRepository: InvestorKycDocumentRequirementsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @inject('service.investorKycDocumentRequirementsService.service')
    private investorKycDocumentRequirementsService: InvestorKycDocumentRequirementsService,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) {}

  async fetchForKycStepper(usersId: string): Promise<{
    success: boolean;
    message: string;
    documents: InvestorKycDocumentStepperItem[];
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
      await this.investorKycDocumentRequirementsService.fetchRequiredDocuments(
        usersId,
      );

    const uploadedDocuments = await this.investorKycDocumentRepository.find({
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

    const uploadedByRequirementId = new Map<string, InvestorKycDocument>();
    for (const uploaded of uploadedDocuments) {
      const requirementId = uploaded.investorKycDocumentRequirementsId;
      if (!uploadedByRequirementId.has(requirementId)) {
        uploadedByRequirementId.set(requirementId, uploaded);
      }
    }

    const documents: InvestorKycDocumentStepperItem[] = requiredDocuments.map(
      (required: InvestorKycRequiredDocument) => {
        const uploaded = uploadedByRequirementId.get(required.id);
        const media = (
          uploaded as InvestorKycDocument & {
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
      message: 'Investor KYC stepper documents',
      documents,
    };
  }

  async fetchByUser(usersId: string): Promise<{
    success: boolean;
    message: string;
    documents: InvestorKycDocument[];
  }> {
    const documents = await this.investorKycDocumentRepository.find({
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
          relation: 'investorKycDocumentRequirements',
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
      message: 'Investor KYC documents',
      documents,
    };
  }

  async uploadDocumentsForKyc(
    usersId: string,
    documents: InvestorKycDocumentCreatePayload[],
    tx: unknown,
  ): Promise<{
    success: boolean;
    message: string;
    uploadedDocuments: InvestorKycDocument[];
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
        await this.investorKycDocumentRequirementsRepository.findOne(
          {
            where: {
              and: [
                {id: document.investorKycDocumentRequirementsId},
                {isActive: true},
                {isDeleted: false},
              ],
            },
          },
          {transaction: tx},
        );

      if (!documentRequirement) {
        throw new HttpErrors.NotFound(
          'Investor KYC document requirement not found',
        );
      }
    }

    const uploadedDocuments: InvestorKycDocument[] = [];

    for (const document of documents) {
      const existingDoc = await this.investorKycDocumentRepository.findOne(
        {
          where: {
            and: [
              {usersId: document.usersId},
              {
                investorKycDocumentRequirementsId:
                  document.investorKycDocumentRequirementsId,
              },
              {isDeleted: false},
            ],
          },
        },
        {transaction: tx},
      );

      if (existingDoc) {
        await this.investorKycDocumentRepository.updateById(
          existingDoc.id,
          {
            documentsFileId: document.documentsFileId,
            status: document.status ?? 0,
            mode: document.mode ?? 1,
            updatedAt: new Date(),
          },
          {transaction: tx},
        );

        const updated = await this.investorKycDocumentRepository.findById(
          existingDoc.id,
        );
        uploadedDocuments.push(updated);
        continue;
      }

      const created = await this.investorKycDocumentRepository.create(document, {
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
    documentPayload: InvestorKycDocumentCreatePayload,
  ): Promise<{
    success: boolean;
    message: string;
    document: InvestorKycDocument;
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
      await this.investorKycDocumentRequirementsRepository.findOne({
        where: {
          and: [
            {id: documentPayload.investorKycDocumentRequirementsId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (!documentRequirement) {
      throw new HttpErrors.NotFound(
        'Investor KYC document requirement not found',
      );
    }

    const document =
      await this.investorKycDocumentRepository.create(documentPayload);

    await this.mediaService.updateMediaUsedStatus(
      [documentPayload.documentsFileId],
      true,
    );

    return {
      success: true,
      message: 'Investor KYC document uploaded',
      document,
    };
  }

  async updateStatus(
    documentId: string,
    status: number,
    reason: string,
  ): Promise<{success: boolean; message: string}> {
    const existingDocument = await this.investorKycDocumentRepository.findOne({
      where: {
        and: [{id: documentId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!existingDocument) {
      throw new HttpErrors.NotFound('Investor KYC document not found');
    }

    if (![0, 1, 2].includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.investorKycDocumentRepository.updateById(documentId, {
        status: 1,
        verifiedAt: new Date(),
      });

      return {
        success: true,
        message: 'Investor KYC document approved',
      };
    }

    if (status === 2) {
      await this.investorKycDocumentRepository.updateById(documentId, {
        status: 2,
        reason,
      });

      return {
        success: true,
        message: 'Investor KYC document rejected',
      };
    }

    await this.investorKycDocumentRepository.updateById(documentId, {
      status: 0,
      reason: '',
      verifiedAt: undefined,
    });

    return {
      success: true,
      message: 'Investor KYC document moved to under review',
    };
  }
}
