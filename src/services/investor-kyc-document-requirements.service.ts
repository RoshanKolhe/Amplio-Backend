import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {InvestorKycDocumentRequirements} from '../models';
import {
  InvestorKycDocumentRequirementsRepository,
  InvestorProfileRepository,
  InvestorTypeRepository,
  UsersRepository,
} from '../repositories';

export interface InvestorKycRequiredDocument {
  id: string;
  documentLabel: string;
  documentValue: string;
  isMandatory: boolean;
}

export class InvestorKycDocumentRequirementsService {
  constructor(
    @repository(InvestorKycDocumentRequirementsRepository)
    private documentRequirementRepository: InvestorKycDocumentRequirementsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(InvestorTypeRepository)
    private investorTypeRepository: InvestorTypeRepository,
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
    requirement: Omit<InvestorKycDocumentRequirements, 'id'>,
  ): Promise<InvestorKycDocumentRequirements> {
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
    requirements: Omit<InvestorKycDocumentRequirements, 'id'>[],
  ): Promise<InvestorKycDocumentRequirements[]> {
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
    requirement: Partial<InvestorKycDocumentRequirements>,
  ): Promise<void> {
    const updateData: Partial<InvestorKycDocumentRequirements> = {
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
    doc: InvestorKycDocumentRequirements,
    investorTypeValue: string,
  ): boolean {
    const conditionValues = this.parseConditionValues(doc.conditionValue);

    switch (doc.conditionOperator) {
      case 'EQ':
        return conditionValues.includes(String(investorTypeValue));
      default:
        return false;
    }
  }

  private async documentListAsPerConditions(
    documents: InvestorKycDocumentRequirements[],
    usersId: string,
  ): Promise<InvestorKycRequiredDocument[]> {
    const user = await this.usersRepository.findOne({
      where: {
        and: [{id: usersId}, {isDeleted: false}],
      },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    const investorProfile = await this.investorProfileRepository.findOne({
      where: {
        and: [{usersId: user.id}, {isDeleted: false}],
      },
    });

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor profile not found');
    }

    if (!investorProfile.investorTypeId) {
      throw new HttpErrors.NotFound('Investor type not found');
    }

    const investorType = await this.investorTypeRepository.findOne({
      where: {
        and: [
          {id: investorProfile.investorTypeId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!investorType) {
      throw new HttpErrors.NotFound('Investor type not found');
    }

    const result: Array<InvestorKycRequiredDocument & {sequenceOrder: number}> =
      [];

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
        doc.conditionType === 'INVESTOR_TYPE' &&
        doc.conditionOperator &&
        doc.conditionValue
      ) {
        const isValid = this.checkCondition(doc, investorType.value);

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
    usersId: string,
  ): Promise<InvestorKycRequiredDocument[]> {
    const documents = await this.documentRequirementRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['sequenceOrder ASC'],
    });

    return this.documentListAsPerConditions(documents, usersId);
  }
}
