import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {MerchantKycDocumentRequirements} from '../models';
import {
  MerchantDealershipTypeRepository,
  MerchantKycDocumentRequirementsRepository,
  MerchantProfilesRepository,
  UsersRepository,
} from '../repositories';

export interface MerchantKycRequiredDocument {
  id: string;
  documentLabel: string;
  documentValue: string;
  isMandatory: boolean;
}

export class MerchantKycDocumentRequirementsService {
  constructor(
    @repository(MerchantKycDocumentRequirementsRepository)
    private documentRequirementRepository: MerchantKycDocumentRequirementsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository,
    @repository(MerchantProfilesRepository)
    private merchantProfilesRepository: MerchantProfilesRepository,
    @repository(MerchantDealershipTypeRepository)
    private merchantDealershipTypeRepository: MerchantDealershipTypeRepository,
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
    requirement: Omit<MerchantKycDocumentRequirements, 'id'>,
  ): Promise<MerchantKycDocumentRequirements> {
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
    requirements: Omit<MerchantKycDocumentRequirements, 'id'>[],
  ): Promise<MerchantKycDocumentRequirements[]> {
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
    requirement: Partial<MerchantKycDocumentRequirements>,
  ): Promise<void> {
    const updateData: Partial<MerchantKycDocumentRequirements> = {
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
    doc: MerchantKycDocumentRequirements,
    dealershipTypeValue: string,
  ): boolean {
    const conditionValues = this.parseConditionValues(doc.conditionValue);

    switch (doc.conditionOperator) {
      case 'EQ':
        return conditionValues.includes(String(dealershipTypeValue));
      default:
        return false;
    }
  }

  private async documentListAsPerConditions(
    documents: MerchantKycDocumentRequirements[],
    usersId: string,
  ): Promise<MerchantKycRequiredDocument[]> {
    const user = await this.usersRepository.findOne({
      where: {
        and: [{id: usersId}, {isDeleted: false}],
      },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: user.id}, {isDeleted: false}],
      },
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant profile not found');
    }

    const dealershipType =
      await this.merchantDealershipTypeRepository.findOne({
        where: {
          and: [
            {id: merchantProfile.merchantDealershipTypeId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (!dealershipType) {
      throw new HttpErrors.NotFound('Merchant dealership type not found');
    }

    const result: Array<
      MerchantKycRequiredDocument & {sequenceOrder: number}
    > = [];

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
        doc.conditionType === 'DEALERSHIP_TYPE' &&
        doc.conditionOperator &&
        doc.conditionValue
      ) {
        const isValid = this.checkCondition(doc, dealershipType.value);

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
  ): Promise<MerchantKycRequiredDocument[]> {
    const documents = await this.documentRequirementRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['sequenceOrder ASC'],
    });

    return this.documentListAsPerConditions(documents, usersId);
  }
}
