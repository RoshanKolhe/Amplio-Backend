import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SpvKycDocumentType} from '../models';
import {SpvKycDocumentTypeRepository} from '../repositories';

export class SpvKycDocumentTypeService {
  constructor(
    @repository(SpvKycDocumentTypeRepository)
    private spvKycDocumentTypeRepository: SpvKycDocumentTypeRepository,
  ) {}

  async createDocumentType(
    payload: Omit<SpvKycDocumentType, 'id'>,
  ): Promise<SpvKycDocumentType> {
    return this.spvKycDocumentTypeRepository.create(payload);
  }

  async getActiveDocumentTypeByValueOrFail(
    value: string,
  ): Promise<SpvKycDocumentType> {
    const documentType = await this.spvKycDocumentTypeRepository.findOne({
      where: {
        value,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!documentType) {
      throw new HttpErrors.BadRequest(
        `SPV KYC document type "${value}" is not configured`,
      );
    }

    return documentType;
  }

  async getTemplateIdByValueOrFail(value: string): Promise<string> {
    const documentType = await this.getActiveDocumentTypeByValueOrFail(value);

    if (!documentType.fileTemplateId) {
      throw new HttpErrors.BadRequest(
        `SPV KYC template file is missing for "${value}"`,
      );
    }

    return documentType.fileTemplateId;
  }

  async getActiveDocumentTypesByValuesOrFail(
    values: string[],
  ): Promise<SpvKycDocumentType[]> {
    const documentTypes = await this.spvKycDocumentTypeRepository.find({
      where: {
        value: {inq: values},
        isActive: true,
        isDeleted: false,
      },
    });

    if (documentTypes.length !== values.length) {
      const missingValues = values.filter(
        value => !documentTypes.find(documentType => documentType.value === value),
      );

      throw new HttpErrors.BadRequest(
        `SPV KYC document type missing: ${missingValues.join(', ')}`,
      );
    }

    return values.map(value => {
      const documentType = documentTypes.find(doc => doc.value === value);

      if (!documentType) {
        throw new HttpErrors.BadRequest(
          `SPV KYC document type "${value}" is not configured`,
        );
      }

      return documentType;
    });
  }
}
