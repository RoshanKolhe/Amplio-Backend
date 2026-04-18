import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Spv} from '../models';
import {SpvRepository} from '../repositories';

export class SpvService {
  constructor(
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
  ) {}

  async createOrUpdateSpv(
    applicationId: string,
    spvData: Omit<Spv, 'id' | 'spvApplicationId'>,
    tx?: unknown,
  ): Promise<{
    applicationId: string;
    spv: Spv;
    updateStatus: boolean;
  }> {
    const existingSpv = await this.spvRepository.findOne({
      where: {
        and: [
          {spvApplicationId: applicationId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (existingSpv) {
      await this.spvRepository.updateById(existingSpv.id, spvData, tx ? {transaction: tx} : undefined);

      const updatedSpv = await this.spvRepository.findById(
        existingSpv.id,
        undefined,
        tx ? {transaction: tx} : undefined,
      );

      return {
        applicationId,
        spv: updatedSpv,
        updateStatus: false,
      };
    }

    const spv = await this.spvRepository.create(
      {
        ...spvData,
        spvApplicationId: applicationId,
      },
      tx ? {transaction: tx} : undefined,
    );

    return {
      applicationId,
      spv,
      updateStatus: false,
    };
  }

  async fetchSpvByApplicationId(applicationId: string): Promise<Spv | null> {
    return this.spvRepository.findOne({
      where: {
        and: [
          {spvApplicationId: applicationId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });
  }

  async fetchSpvByApplicationIdOrFail(applicationId: string): Promise<Spv> {
    const spv = await this.fetchSpvByApplicationId(applicationId);

    if (!spv) {
      throw new HttpErrors.NotFound('SPV data not found');
    }

    return spv;
  }
}
