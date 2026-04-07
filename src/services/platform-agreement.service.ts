import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {PlatformAgreement} from '../models';
import {
  BusinessKycDocumentTypeRepository,
  PlatformAgreementRepository,
} from '../repositories';

const INVESTOR_PLATFORM_AGREEMENT_DOCUMENT_VALUE = 'investor_agreement';

export class PlatformAgreementService {
  constructor(
    @repository(PlatformAgreementRepository)
    private platformAgreementRepository: PlatformAgreementRepository,
    @repository(BusinessKycDocumentTypeRepository)
    private businessKycDocumentTypeRepository: BusinessKycDocumentTypeRepository,
  ) {}

  private async resolveDocumentType(documentTypeId?: string) {
    const where = documentTypeId
      ? {
          id: documentTypeId,
          isActive: true,
          isDeleted: false,
        }
      : {
          value: INVESTOR_PLATFORM_AGREEMENT_DOCUMENT_VALUE,
          isActive: true,
          isDeleted: false,
        };

    const documentType = await this.businessKycDocumentTypeRepository.findOne({
      where,
      include: [
        {
          relation: 'fileTemplate',
          scope: {
            fields: {
              id: true,
              fileUrl: true,
              fileName: true,
              fileOriginalName: true,
              fileType: true,
            },
          },
        },
      ],
    });

    if (!documentType) {
      throw new HttpErrors.BadRequest(
        documentTypeId
          ? 'Invalid business KYC document type id'
          : 'Platform agreement document type is not configured',
      );
    }

    return documentType;
  }

  private async findAgreement(
    usersId: string,
    roleValue: string,
    identifierId: string,
  ) {
    return this.platformAgreementRepository.findOne({
      where: {
        and: [
          {usersId},
          {roleValue},
          {identifierId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      include: [
        {
          relation: 'businessKycDocumentType',
          scope: {
            fields: {
              id: true,
              name: true,
              value: true,
              description: true,
              draftingMode: true,
              fileTemplateId: true,
            },
            include: [
              {
                relation: 'fileTemplate',
                scope: {
                  fields: {
                    id: true,
                    fileUrl: true,
                    fileName: true,
                    fileOriginalName: true,
                    fileType: true,
                  },
                },
              },
            ],
          },
        },
        {
          relation: 'media',
          scope: {
            fields: {
              id: true,
              fileUrl: true,
              fileName: true,
              fileOriginalName: true,
              fileType: true,
            },
          },
        },
      ],
    });
  }

  async createOrUpdatePlatformAgreement(
    agreementData: Partial<PlatformAgreement>,
  ): Promise<{
    success: boolean;
    message: string;
    platformAgreement: PlatformAgreement;
  }> {
    if (
      !agreementData.usersId ||
      !agreementData.identifierId ||
      !agreementData.roleValue ||
      !agreementData.businessKycDocumentTypeId
    ) {
      throw new HttpErrors.BadRequest(
        'usersId, identifierId, roleValue and businessKycDocumentTypeId are required',
      );
    }

    const documentType = await this.resolveDocumentType(
      agreementData.businessKycDocumentTypeId,
    );

    const existingAgreement = await this.platformAgreementRepository.findOne({
      where: {
        and: [
          {usersId: agreementData.usersId},
          {identifierId: agreementData.identifierId},
          {roleValue: agreementData.roleValue},
          {businessKycDocumentTypeId: documentType.id},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    const payload = {
      ...agreementData,
      businessKycDocumentTypeId: documentType.id,
      mediaId: documentType.fileTemplateId,
      status: agreementData.status ?? 0,
      mode: agreementData.mode ?? 1,
      isActive: agreementData.isActive ?? true,
      isDeleted: agreementData.isDeleted ?? false,
    };

    if (existingAgreement?.status === 1) {
      throw new HttpErrors.BadRequest(
        'Platform agreement is already approved and cannot be modified',
      );
    }

    if (existingAgreement) {
      await this.platformAgreementRepository.updateById(existingAgreement.id, {
        ...payload,
        reason: undefined,
        verifiedAt: undefined,
      });

      const updatedAgreement = await this.findAgreement(
        agreementData.usersId,
        agreementData.roleValue,
        agreementData.identifierId,
      );

      if (!updatedAgreement) {
        throw new HttpErrors.NotFound('Platform agreement not found');
      }

      return {
        success: true,
        message: 'Platform agreement updated successfully',
        platformAgreement: updatedAgreement,
      };
    }

    await this.platformAgreementRepository.create(payload);

    const platformAgreement = await this.findAgreement(
      agreementData.usersId,
      agreementData.roleValue,
      agreementData.identifierId,
    );

    if (!platformAgreement) {
      throw new HttpErrors.NotFound('Platform agreement not found');
    }

    return {
      success: true,
      message: 'Platform agreement saved successfully',
      platformAgreement,
    };
  }

  async fetchUserPlatformAgreement(
    usersId: string,
    roleValue: string,
    identifierId: string,
  ): Promise<{
    success: boolean;
    message: string;
    platformAgreement: PlatformAgreement | null;
  }> {
    let platformAgreement = await this.findAgreement(
      usersId,
      roleValue,
      identifierId,
    );

    if (!platformAgreement) {
      const documentType = await this.resolveDocumentType();

      await this.platformAgreementRepository.create({
        usersId,
        roleValue,
        identifierId,
        businessKycDocumentTypeId: documentType.id,
        mediaId: documentType.fileTemplateId,
        isConsent: false,
        status: 0,
        mode: 1,
        isActive: true,
        isDeleted: false,
      });

      platformAgreement = await this.findAgreement(
        usersId,
        roleValue,
        identifierId,
      );
    }

    return {
      success: true,
      message: 'Platform agreement',
      platformAgreement,
    };
  }
}
