import {injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Transaction} from 'loopback-datasource-juggler';
import {SpvKycDocument, SpvKycDocumentWithRelations} from '../models';
import {
  SpvKycDocumentRepository,
  SpvKycDocumentTypeRepository,
} from '../repositories';

const SPV_KYC_DOCUMENT_VALUES = [
  'trust_deed',
  'escrow_agreement',
  'information_memorandum',
] as const;

export type SpvKycDocumentValue = (typeof SPV_KYC_DOCUMENT_VALUES)[number];
export type SpvSignerStatus = 'not_required' | 'locked' | 'pending' | 'signed';
export type SpvDocumentOverallSigningStatus = 'pending' | 'signed';
export type SpvKycDocumentWithSigningDetails = SpvKycDocumentWithRelations & {
  overallSigningStatus: SpvDocumentOverallSigningStatus;
  signing: {
    trustee: {
      required: boolean;
      status: SpvSignerStatus;
      signedAt?: Date;
    };
  };
  signingActions: {
    documentsScreen: {
      showTrusteeSignButton: boolean;
    };
    trustDeedScreen: {
      showTrusteeSignButton: boolean;
    };
  };
};

@injectable()
export class SpvKycDocumentService {
  constructor(
    @repository(SpvKycDocumentRepository)
    private spvKycDocumentRepository: SpvKycDocumentRepository,
    @repository(SpvKycDocumentTypeRepository)
    private spvKycDocumentTypeRepository: SpvKycDocumentTypeRepository,
  ) {}

  private getDefaultSigningState(documentValue: SpvKycDocumentValue) {
    switch (documentValue) {
      case 'trust_deed':
      case 'escrow_agreement':
      case 'information_memorandum':
      case 'information_memorandum':
      default:
        return {
          trusteeSignStatus: 'pending' as SpvSignerStatus,
        };
    }
  }

  private buildSigningActions(documentValue?: string) {
    if (documentValue === 'trust_deed') {
      return {
        documentsScreen: {
          showTrusteeSignButton: false,
        },
        trustDeedScreen: {
          showTrusteeSignButton: true,
        },
      };
    }

    return {
      documentsScreen: {
        showTrusteeSignButton: true,
      },
      trustDeedScreen: {
        showTrusteeSignButton: false,
      },
    };
  }

  private deriveOverallSigningStatus(
    trusteeSignStatus: SpvSignerStatus,
  ): SpvDocumentOverallSigningStatus {
    if (trusteeSignStatus === 'signed') {
      return 'signed';
    }

    return 'pending';
  }

  private deriveDocumentStatus(trusteeSignStatus: SpvSignerStatus): number {
    return this.deriveOverallSigningStatus(trusteeSignStatus) === 'signed'
      ? 1
      : 0;
  }

  private buildSigningResponse(
    document: SpvKycDocumentWithRelations,
  ): SpvKycDocumentWithSigningDetails {
    const trusteeSignStatus = (document.trusteeSignStatus ??
      'pending') as SpvSignerStatus;

    return Object.assign(document, {
      overallSigningStatus: this.deriveOverallSigningStatus(trusteeSignStatus),
      signing: {
        trustee: {
          required: trusteeSignStatus !== 'not_required',
          status: trusteeSignStatus,
          signedAt: document.trusteeSignedAt,
        },
      },
      signingActions: this.buildSigningActions(
        document.spvKycDocumentType?.value,
      ),
    });
  }

  async createDocumentFromTemplate(
    spvApplicationId: string,
    documentValue: SpvKycDocumentValue,
    tx?: Transaction,
    options?: {
      mediaId?: string;
      sequenceOrder?: number;
    },
  ): Promise<SpvKycDocument> {
    const documentType = await this.spvKycDocumentTypeRepository.findOne(
      {
        where: {
          value: documentValue,
          isActive: true,
          isDeleted: false,
        },
      },
      tx ? {transaction: tx} : undefined,
    );

    const defaultSigningState = this.getDefaultSigningState(documentValue);

    if (!documentType) {
      throw new HttpErrors.BadRequest(
        `SPV KYC document type "${documentValue}" is not configured`,
      );
    }

    if (!documentType.fileTemplateId) {
      throw new HttpErrors.BadRequest(
        `Template file is missing for "${documentValue}"`,
      );
    }

    const existingDocument = await this.spvKycDocumentRepository.findOne(
      {
        where: {
          spvApplicationId,
          spvKycDocumentTypeId: documentType.id,
          isDeleted: false,
        },
      },
      tx ? {transaction: tx} : undefined,
    );

    if (existingDocument) {
      const normalizedPayload: Partial<SpvKycDocument> = {};

      if (
        existingDocument.trusteeSignStatus !== 'signed' &&
        !existingDocument.trusteeSignedAt
      ) {
        normalizedPayload.trusteeSignStatus = defaultSigningState.trusteeSignStatus;
      }

      if (
        Object.keys(normalizedPayload).length > 0 ||
        options?.mediaId !== undefined ||
        options?.sequenceOrder !== undefined
      ) {
        await this.spvKycDocumentRepository.updateById(
          existingDocument.id!,
          {
            ...normalizedPayload,
            mediaId: options?.mediaId ?? existingDocument.mediaId,
            sequenceOrder:
              options?.sequenceOrder ?? existingDocument.sequenceOrder,
          },
          tx ? {transaction: tx} : undefined,
        );

        return this.spvKycDocumentRepository.findById(
          existingDocument.id!,
          undefined,
          tx ? {transaction: tx} : undefined,
        );
      }

      return existingDocument;
    }

    return this.spvKycDocumentRepository.create(
      {
        spvApplicationId,
        spvKycDocumentTypeId: documentType.id,
        mediaId: options?.mediaId ?? documentType.fileTemplateId,
        sequenceOrder: options?.sequenceOrder,
        status: 0,
        ...defaultSigningState,
        isAccepted: false,
        isActive: true,
        isDeleted: false,
      },
      tx ? {transaction: tx} : undefined,
    );
  }

  async createDefaultDocuments(
    spvApplicationId: string,
    tx?: Transaction,
  ): Promise<SpvKycDocument[]> {
    const createdDocuments: SpvKycDocument[] = [];

    for (const [index, documentValue] of SPV_KYC_DOCUMENT_VALUES.entries()) {
      const createdDocument = await this.createDocumentFromTemplate(
        spvApplicationId,
        documentValue,
        tx,
        {
          sequenceOrder: index + 1,
        },
      );

      createdDocuments.push(createdDocument);
    }

    return createdDocuments;
  }

  async fetchDocumentsByApplicationId(
    spvApplicationId: string,
  ): Promise<SpvKycDocumentWithSigningDetails[]> {
    const documents = await this.spvKycDocumentRepository.find({
      where: {
        spvApplicationId,
        isActive: true,
        isDeleted: false,
      },
      include: [
        {
          relation: 'spvKycDocumentType',
          scope: {
            fields: ['id', 'name', 'value', 'description', 'draftingMode'],
          },
        },
        {
          relation: 'media',
          scope: {
            fields: ['id', 'fileUrl', 'fileName'],
          },
        },
      ],
      order: ['sequenceOrder ASC', 'createdAt ASC'],
    });

    return documents.map(document => this.buildSigningResponse(document));
  }

  async fetchDocumentByApplicationIdAndValue(
    spvApplicationId: string,
    documentValue: SpvKycDocumentValue,
  ): Promise<SpvKycDocumentWithSigningDetails | null> {
    const documentType = await this.spvKycDocumentTypeRepository.findOne({
      where: {
        value: documentValue,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!documentType) {
      return null;
    }

    const document = await this.spvKycDocumentRepository.findOne({
      where: {
        spvApplicationId,
        spvKycDocumentTypeId: documentType.id,
        isActive: true,
        isDeleted: false,
      },
      include: [
        {
          relation: 'spvKycDocumentType',
          scope: {
            fields: ['id', 'name', 'value', 'description', 'draftingMode'],
          },
        },
        {
          relation: 'media',
          scope: {
            fields: ['id', 'fileUrl', 'fileName', 'fileOriginalName'],
          },
        },
      ],
    });

    if (!document) {
      return null;
    }

    return this.buildSigningResponse(document);
  }

  async updateDocumentById(
    documentId: string,
    payload: Partial<SpvKycDocument>,
    tx?: Transaction,
  ): Promise<SpvKycDocumentWithSigningDetails> {
    await this.spvKycDocumentRepository.updateById(
      documentId,
      {
        ...payload,
        updatedAt: new Date(),
      },
      tx ? {transaction: tx} : undefined,
    );

    let updatedDocument = (await this.spvKycDocumentRepository.findById(
      documentId,
      {
        include: [
          {relation: 'spvKycDocumentType'},
          {relation: 'media'},
        ],
      },
      tx ? {transaction: tx} : undefined,
    )) as SpvKycDocumentWithRelations;

    const defaultSigningState = this.getDefaultSigningState(
      (updatedDocument.spvKycDocumentType?.value ??
        'escrow_agreement') as SpvKycDocumentValue,
    );
    const trusteeSignStatus = (updatedDocument.trusteeSignStatus ??
      defaultSigningState.trusteeSignStatus) as SpvSignerStatus;
    const derivedStatus = this.deriveDocumentStatus(trusteeSignStatus);

    if (updatedDocument.status !== derivedStatus) {
      await this.spvKycDocumentRepository.updateById(
        documentId,
        {
          status: derivedStatus,
          updatedAt: new Date(),
        },
        tx ? {transaction: tx} : undefined,
      );

      updatedDocument = (await this.spvKycDocumentRepository.findById(
        documentId,
        {
          include: [
            {relation: 'spvKycDocumentType'},
            {relation: 'media'},
          ],
        },
        tx ? {transaction: tx} : undefined,
      )) as SpvKycDocumentWithRelations;
    }

    return this.buildSigningResponse(updatedDocument);
  }

  async syncSigningStateByValue(
    spvApplicationId: string,
    documentValue: SpvKycDocumentValue,
    payload: Pick<
      SpvKycDocument,
      'trusteeSignStatus' | 'trusteeSignedAt'
    >,
    tx?: Transaction,
  ): Promise<SpvKycDocumentWithSigningDetails | null> {
    const document = await this.fetchDocumentByApplicationIdAndValue(
      spvApplicationId,
      documentValue,
    );

    if (!document?.id) {
      return null;
    }

    return this.updateDocumentById(document.id, payload, tx);
  }
}
