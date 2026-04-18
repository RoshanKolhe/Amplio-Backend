import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {PtcParameters} from '../models';
import {PtcParametersRepository} from '../repositories';

export class PtcParametersService {
  constructor(
    @repository(PtcParametersRepository)
    private ptcParametersRepository: PtcParametersRepository,
  ) {}

  async createOrUpdate(
    spvApplicationId: string,
    payload: Omit<PtcParameters, 'id' | 'spvApplicationId'>,
    tx?: unknown,
  ): Promise<PtcParameters> {
    const existing = await this.ptcParametersRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (existing) {
      await this.ptcParametersRepository.updateById(
        existing.id,
        payload,
        tx ? {transaction: tx} : undefined,
      );

      return this.ptcParametersRepository.findById(
        existing.id,
        undefined,
        tx ? {transaction: tx} : undefined,
      );
    }

    return this.ptcParametersRepository.create(
      {
        ...payload,
        spvApplicationId,
      },
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchByApplicationId(
    spvApplicationId: string,
  ): Promise<PtcParameters | null> {
    return this.ptcParametersRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
    });
  }

  async fetchByApplicationIdOrFail(spvApplicationId: string): Promise<PtcParameters> {
    const record = await this.fetchByApplicationId(spvApplicationId);

    if (!record) {
      throw new HttpErrors.NotFound('PTC parameters not found');
    }

    return record;
  }
}
