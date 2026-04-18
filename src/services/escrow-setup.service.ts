import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {EscrowSetup} from '../models';
import {EscrowSetupRepository} from '../repositories';

export class EscrowSetupService {
  constructor(
    @repository(EscrowSetupRepository)
    private escrowSetupRepository: EscrowSetupRepository,
  ) {}

  async createOrUpdate(
    spvApplicationId: string,
    payload: Omit<EscrowSetup, 'id' | 'spvApplicationId'>,
    tx?: unknown,
  ): Promise<EscrowSetup> {
    const existing = await this.escrowSetupRepository.findOne({
      where: {
        and: [
          {spvApplicationId},
          {accountType: payload.accountType},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (existing) {
      await this.escrowSetupRepository.updateById(
        existing.id,
        payload,
        tx ? {transaction: tx} : undefined,
      );

      return this.escrowSetupRepository.findById(
        existing.id,
        undefined,
        tx ? {transaction: tx} : undefined,
      );
    }

    return this.escrowSetupRepository.create(
      {
        ...payload,
        spvApplicationId,
      },
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchByApplicationId(
    spvApplicationId: string,
  ): Promise<EscrowSetup[]> {
    return this.escrowSetupRepository.find({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt ASC'],
    });
  }

  async fetchByApplicationIdOrFail(
    spvApplicationId: string,
  ): Promise<EscrowSetup[]> {
    const record = await this.fetchByApplicationId(spvApplicationId);

    if (!record.length) {
      throw new HttpErrors.NotFound('Escrow setup not found');
    }

    return record;
  }
}
