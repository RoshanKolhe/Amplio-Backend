import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {IsinApplication} from '../models';
import {IsinApplicationRepository} from '../repositories';

export class IsinApplicationService {
  constructor(
    @repository(IsinApplicationRepository)
    private isinApplicationRepository: IsinApplicationRepository,
  ) {}

  async createOrUpdate(
    spvApplicationId: string,
    payload: Partial<
      Pick<
        IsinApplication,
        | 'depositoryId'
        | 'securityType'
        | 'isinNumber'
        | 'issueSize'
        | 'issueDate'
        | 'creditRating'
        | 'isinLetterDocId'
        | 'isActive'
        | 'isDeleted'
      >
    >,
    tx?: unknown,
  ): Promise<IsinApplication> {
    const existing = await this.isinApplicationRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (existing) {
      await this.isinApplicationRepository.updateById(
        existing.id,
        payload,
        tx ? {transaction: tx} : undefined,
      );

      return this.isinApplicationRepository.findById(
        existing.id,
        {
          include: [{relation: 'isinLetterDoc'}],
        },
        tx ? {transaction: tx} : undefined,
      );
    }

    return this.isinApplicationRepository.create(
      {
        ...payload,
        spvApplicationId,
      },
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchByApplicationId(
    spvApplicationId: string,
  ): Promise<IsinApplication | null> {
    return this.isinApplicationRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
      include: [{relation: 'isinLetterDoc'}],
    });
  }

  async fetchByApplicationIdOrFail(
    spvApplicationId: string,
  ): Promise<IsinApplication> {
    const record = await this.fetchByApplicationId(spvApplicationId);

    if (!record) {
      throw new HttpErrors.NotFound('ISIN application not found');
    }

    return record;
  }

  withDerivedValues(
    isinApplication: IsinApplication | null,
    derivedValues: {
      issueSize?: string;
      creditRating?: string;
    },
  ): IsinApplication | null {
    if (!isinApplication) {
      return null;
    }

    return Object.assign(isinApplication, {
      issueSize: derivedValues.issueSize ?? isinApplication.issueSize,
      creditRating: derivedValues.creditRating ?? isinApplication.creditRating,
    });
  }
}
