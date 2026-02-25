import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {CompanyKycDocumentRequirements} from '../models';
import {
  CompanyEntityTypeRepository,
  CompanyKycDocumentRequirementsRepository,
  CompanyProfilesRepository,
  UsersRepository,
} from '../repositories';

export interface CompanyKycRequiredDocument {
  id: string;
  documentLabel: string;
  documentValue: string;
  isMandatory: boolean;
}

export class CompanyKycDocumentRequirementsService {
  constructor(
    @repository(CompanyKycDocumentRequirementsRepository)
    private documentRequirementRepository: CompanyKycDocumentRequirementsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @repository(CompanyProfilesRepository)
    private companyProfilesRepository: CompanyProfilesRepository,
    @repository(CompanyEntityTypeRepository)
    private companyEntityTypeRepository: CompanyEntityTypeRepository,
  ) {}

  private normalizeConditionValues(
    conditionValue: string[] | string | undefined,
  ): string[] {
    if (!conditionValue) {
      return [];
    }

    if (Array.isArray(conditionValue)) {
      return conditionValue.map(value => String(value));
    }

    return [String(conditionValue)];
  }

  async createRequirement(
    requirement: Omit<CompanyKycDocumentRequirements, 'id'>,
  ): Promise<CompanyKycDocumentRequirements> {
    const conditionValues = this.normalizeConditionValues(
      requirement.conditionValue,
    );

    if (!conditionValues.length) {
      throw new HttpErrors.BadRequest('conditionValue must contain values');
    }

    return this.documentRequirementRepository.create({
      ...requirement,
      conditionValue: conditionValues,
      isActive: requirement.isActive ?? true,
      isDeleted: requirement.isDeleted ?? false,
    });
  }

  async createBulkRequirements(
    requirements: Omit<CompanyKycDocumentRequirements, 'id'>[],
  ): Promise<CompanyKycDocumentRequirements[]> {
    if (!requirements.length) {
      throw new HttpErrors.BadRequest('At least one requirement is required');
    }

    const normalizedRequirements = requirements.map(requirement => {
      const conditionValues = this.normalizeConditionValues(
        requirement.conditionValue,
      );

      if (!conditionValues.length) {
        throw new HttpErrors.BadRequest('conditionValue must contain values');
      }

      return {
        ...requirement,
        conditionValue: conditionValues,
        isActive: requirement.isActive ?? true,
        isDeleted: requirement.isDeleted ?? false,
      };
    });

    return this.documentRequirementRepository.createAll(normalizedRequirements);
  }

  async updateRequirementById(
    id: string,
    requirement: Partial<CompanyKycDocumentRequirements>,
  ): Promise<void> {
    const updateData: Partial<CompanyKycDocumentRequirements> = {
      ...requirement,
      updatedAt: requirement.updatedAt ?? new Date(),
    };

    if (requirement.conditionValue !== undefined) {
      const conditionValues = this.normalizeConditionValues(
        requirement.conditionValue,
      );

      if (!conditionValues.length) {
        throw new HttpErrors.BadRequest('conditionValue must contain values');
      }

      updateData.conditionValue = conditionValues;
    }

    await this.documentRequirementRepository.updateById(id, updateData);
  }

  private parseConditionValues(
    conditionValue: string[] | string | undefined,
  ): string[] {
    if (!conditionValue) {
      return [];
    }

    if (Array.isArray(conditionValue)) {
      return conditionValue.map(value => String(value));
    }

    const value = String(conditionValue).trim();

    if (value.startsWith('{') && value.endsWith('}')) {
      const inner = value.slice(1, -1).trim();

      if (!inner) {
        return [];
      }

      return inner
        .split(',')
        .map(item => item.trim().replace(/^"(.*)"$/, '$1'))
        .map(item => item.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
    }

    return [value];
  }

  private checkCondition(
    doc: CompanyKycDocumentRequirements,
    companyEntityTypeValue: string,
  ): boolean {
    const conditionValues = this.parseConditionValues(doc.conditionValue);

    switch (doc.conditionOperator) {
      case 'EQ':
        return conditionValues.includes(String(companyEntityTypeValue));
      default:
        return false;
    }
  }

  private async documentListAsPerConditions(
    documents: CompanyKycDocumentRequirements[],
    usersId: string,
  ): Promise<CompanyKycRequiredDocument[]> {
    const user = await this.usersRepository.findOne({
      where: {
        and: [{id: usersId}, {isDeleted: false}],
      },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {
        and: [{usersId: user.id}, {isDeleted: false}],
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    const entityType = await this.companyEntityTypeRepository.findOne({
      where: {
        and: [
          {id: companyProfile.companyEntityTypeId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!entityType) {
      throw new HttpErrors.NotFound('Company entity type not found');
    }

    const result: {
      id: string;
      documentLabel: string;
      documentValue: string;
      isMandatory: boolean;
      sequenceOrder: number;
    }[] = [];

    for (const doc of documents) {
      if (doc.conditionType === 'ALWAYS') {
        result.push({
          id: doc.id,
          documentLabel: doc.documentLabel,
          documentValue: doc.documentValue,
          isMandatory: doc.isMandatory,
          sequenceOrder: doc.sequenceOrder,
        });
        continue;
      }

      if (
        doc.conditionType === 'ENTITY_TYPE' &&
        doc.conditionOperator &&
        doc.conditionValue
      ) {
        const isValid = this.checkCondition(doc, entityType.value);

        if (isValid) {
          result.push({
            id: doc.id,
            documentLabel: doc.documentLabel,
            documentValue: doc.documentValue,
            isMandatory: doc.isMandatory,
            sequenceOrder: doc.sequenceOrder,
          });
        }
      }
    }

    return result
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .map(({sequenceOrder, ...document}) => document);
  }

  async fetchRequiredDocuments(
    companyId: string,
  ): Promise<CompanyKycRequiredDocument[]> {
    const documents = await this.documentRequirementRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['sequenceOrder ASC'],
    });

    const documentsList = await this.documentListAsPerConditions(
      documents,
      companyId,
    );

    return documentsList;
  }
}
