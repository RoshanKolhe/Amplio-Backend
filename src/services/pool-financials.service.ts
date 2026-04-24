import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {PoolFinancials} from '../models';
import {PoolFinancialsRepository} from '../repositories';

export class PoolFinancialsService {
  constructor(
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
  ) {}

  async createOrUpdate(
    spvApplicationId: string,
    payload: Omit<PoolFinancials, 'id' | 'spvApplicationId'>,
    tx?: unknown,
  ): Promise<PoolFinancials> {
    const existing = await this.poolFinancialsRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (existing) {
      await this.poolFinancialsRepository.updateById(
        existing.id,
        payload,
        tx ? {transaction: tx} : undefined,
      );

      return this.poolFinancialsRepository.findById(
        existing.id,
        undefined,
        tx ? {transaction: tx} : undefined,
      );
    }

    return this.poolFinancialsRepository.create(
      {
        ...payload,
        spvApplicationId,
      },
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchByApplicationId(
    spvApplicationId: string,
    options?: {includeDeleted?: boolean},
  ): Promise<PoolFinancials | null> {
    return this.poolFinancialsRepository.findOne({
      where: {
        and: options?.includeDeleted
          ? [{spvApplicationId}]
          : [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });
  }

  async fetchBySpvId(
    spvId: string,
    options?: {includeDeleted?: boolean},
  ): Promise<PoolFinancials | null> {
    return this.poolFinancialsRepository.findOne({
      where: {
        and: options?.includeDeleted
          ? [{spvId}]
          : [{spvId}, {isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });
  }

  async attachSpv(
    poolFinancialsId: string,
    spvId: string,
    tx?: unknown,
  ): Promise<void> {
    await this.poolFinancialsRepository.updateById(
      poolFinancialsId,
      {spvId},
      tx ? {transaction: tx} : undefined,
    );
  }

  async updateRuntimeTotals(
    poolFinancialsId: string,
    payload: Pick<
      PoolFinancials,
      'totalFunded' | 'totalSettled' | 'outstanding'
    >,
    tx?: unknown,
  ): Promise<PoolFinancials> {
    await this.poolFinancialsRepository.updateById(
      poolFinancialsId,
      payload,
      tx ? {transaction: tx} : undefined,
    );

    return this.poolFinancialsRepository.findById(
      poolFinancialsId,
      undefined,
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchByApplicationIdOrFail(spvApplicationId: string): Promise<PoolFinancials> {
    const record = await this.fetchByApplicationId(spvApplicationId);

    if (!record) {
      throw new HttpErrors.NotFound('Pool financials not found');
    }

    return record;
  }
}
