import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Spv} from '../models';
import {SpvRepository} from '../repositories';

export class SpvService {
  constructor(
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
  ) {}

  private normalizeSpvName(spvName: string): string {
    return spvName.trim().toLowerCase();
  }

  private async ensureUniqueSpvName(
    spvName: string,
    currentSpvId?: string,
    tx?: unknown,
  ): Promise<string> {
    const trimmedSpvName = spvName.trim();

    const existingSpvs = await this.spvRepository.find(
      {
        where: {
          and: [{isActive: true}, {isDeleted: false}],
        },
      },
      tx ? {transaction: tx} : undefined,
    );

    const duplicateSpv = existingSpvs.find(
      existing =>
        existing.id !== currentSpvId &&
        this.normalizeSpvName(existing.spvName) ===
          this.normalizeSpvName(trimmedSpvName),
    );

    if (duplicateSpv) {
      throw new HttpErrors.BadRequest(
        'SPV name already exists. Please use a different SPV name.',
      );
    }

    return trimmedSpvName;
  }

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

    const uniqueSpvName = await this.ensureUniqueSpvName(
      spvData.spvName,
      existingSpv?.id,
      tx,
    );
    const payload = {
      ...spvData,
      spvName: uniqueSpvName,
    };

    if (existingSpv) {
      await this.spvRepository.updateById(
        existingSpv.id,
        payload,
        tx ? {transaction: tx} : undefined,
      );

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
        ...payload,
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

  async fetchSpvByIdOrFail(spvId: string): Promise<Spv> {
    const spv = await this.spvRepository.findOne({
      where: {
        and: [{id: spvId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!spv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    return spv;
  }
}
