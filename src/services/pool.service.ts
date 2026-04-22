import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {PoolFinancials, PoolTransaction, Transaction} from '../models';
import {
  PoolFinancialsRepository,
  PoolTransactionRepository,
  TransactionRepository,
} from '../repositories';
import {PoolFinancialsService} from './pool-financials.service';
import {SpvService} from './spv.service';

const FUNDED_STATUS = 'fundeed';
const SETTLED_STATUS = 'SETTLED';
const ACTIVE_POOL_STATUS = 'ACTIVE';
const SETTLED_POOL_STATUS = 'SETTLED';

export class PoolService {
  constructor(
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
    @repository(PoolTransactionRepository)
    private poolTransactionRepository: PoolTransactionRepository,
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
    @inject('service.poolFinancials.service')
    private poolFinancialsService: PoolFinancialsService,
    @inject('service.spv.service')
    private spvService: SpvService,
  ) {}

  private normalizeAmount(amount: number): number {
    return Number(Number(amount ?? 0).toFixed(2));
  }

  private isFundedTransaction(transaction: Transaction): boolean {
    return transaction.status === FUNDED_STATUS;
  }

  private async getTransactionForSpvOrFail(
    transactionId: string,
    spvId: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: {
        and: [{id: transactionId}, {spvId}, {isDeleted: false}],
      },
    });

    if (!transaction) {
      throw new HttpErrors.NotFound('Transaction not found for the supplied SPV');
    }

    return transaction;
  }

  private async getPoolFinancialsForSpvOrFail(spvId: string): Promise<PoolFinancials> {
    const spv = await this.spvService.fetchSpvByIdOrFail(spvId);
    const runtimePool = await this.poolFinancialsService.fetchBySpvId(spvId);

    if (runtimePool) {
      return runtimePool;
    }

    const existingPool = await this.poolFinancialsService.fetchByApplicationId(
      spv.spvApplicationId,
    );

    if (!existingPool) {
      throw new HttpErrors.NotFound('Pool financials not found for the SPV');
    }

    await this.poolFinancialsService.attachSpv(existingPool.id, spvId);

    return this.poolFinancialsRepository.findById(existingPool.id);
  }

  async getPoolBySpvId(spvId: string): Promise<PoolFinancials> {
    return this.recomputePoolFinancials(spvId);
  }

  async addFundedTransactionToPool(
    transactionId: string,
    spvId: string,
  ): Promise<{added: boolean; reason?: string}> {
    const transaction = await this.getTransactionForSpvOrFail(transactionId, spvId);

    if (transaction.spvId !== spvId) {
      return {added: false, reason: 'Transaction does not belong to the SPV'};
    }

    if (!this.isFundedTransaction(transaction)) {
      throw new HttpErrors.BadRequest('Only fundeed transactions can be added to the pool');
    }

    if (transaction.isInPool) {
      return {added: false, reason: 'Transaction is already marked as in pool'};
    }

    const existingPoolTransaction = await this.poolTransactionRepository.findOne({
      where: {
        and: [{transactionId}, {spvId}, {isDeleted: false}],
      },
    });

    if (existingPoolTransaction) {
      return {added: false, reason: 'Transaction already exists in the pool'};
    }

    const poolFinancials = await this.getPoolFinancialsForSpvOrFail(spvId);
    const refreshedPool = await this.recomputePoolFinancials(spvId);
    const nextOutstanding = this.normalizeAmount(
      Number(refreshedPool.outstanding ?? 0) + Number(transaction.amount ?? 0),
    );

    if (nextOutstanding > Number(poolFinancials.poolLimit)) {
      return {
        added: false,
        reason: 'Pool limit reached. Transaction retained outside the pool.',
      };
    }

    await this.poolTransactionRepository.create({
      id: uuidv4(),
      transactionId: transaction.id,
      spvId,
      amount: this.normalizeAmount(transaction.amount),
      status: ACTIVE_POOL_STATUS,
      isSettledProcessed: false,
      isActive: true,
      isDeleted: false,
    });

    await this.transactionRepository.updateById(transaction.id, {
      isInPool: true,
      poolAddedAt: new Date(),
    });

    await this.recomputePoolFinancials(spvId);

    return {added: true};
  }

  async syncFundedTransactions(spvId: string): Promise<{
    addedCount: number;
    skipped: Array<{transactionId: string; reason: string}>;
  }> {
    await this.spvService.fetchSpvByIdOrFail(spvId);

    const transactions = await this.transactionRepository.find({
      where: {
        and: [{spvId}, {isDeleted: false}, {isInPool: false}],
      },
      order: ['createdAt ASC'],
    });

    let addedCount = 0;
    const skipped: Array<{transactionId: string; reason: string}> = [];

    for (const transaction of transactions) {
      console.log(
        'CHECK:',
        transaction.id,
        transaction.status,
        transaction.releasedAmount,
        transaction.lastReleasedAt,
      );

      if (transaction.spvId !== spvId) {
        skipped.push({
          transactionId: transaction.id,
          reason: 'Transaction does not belong to the SPV',
        });
        continue;
      }

      if (!this.isFundedTransaction(transaction)) {
        continue;
      }

      const result = await this.addFundedTransactionToPool(transaction.id, spvId);

      if (result.added) {
        addedCount += 1;
        continue;
      }

      skipped.push({
        transactionId: transaction.id,
        reason: result.reason ?? 'Skipped',
      });
    }

    return {addedCount, skipped};
  }

  async markSettledTransaction(
    transactionId: string,
    spvId: string,
  ): Promise<boolean> {
    const transaction = await this.getTransactionForSpvOrFail(transactionId, spvId);
    if (transaction.spvId !== spvId) {
      return false;
    }

    const poolTransaction = await this.poolTransactionRepository.findOne({
      where: {
        and: [{transactionId}, {spvId}, {isDeleted: false}],
      },
    });

    if (!poolTransaction) {
      return false;
    }

    if (
      poolTransaction.status !== ACTIVE_POOL_STATUS ||
      poolTransaction.isSettledProcessed
    ) {
      return false;
    }

    if (String(transaction.pspSettlementStatus).toUpperCase() !== SETTLED_STATUS) {
      return false;
    }

    await this.poolTransactionRepository.updateById(poolTransaction.id, {
      status: SETTLED_POOL_STATUS,
      isSettledProcessed: true,
      settledAt: new Date(),
    });

    await this.recomputePoolFinancials(spvId);

    return true;
  }

  async processSettledTransactions(spvId: string): Promise<{settledCount: number}> {
    await this.spvService.fetchSpvByIdOrFail(spvId);

    const unsettledPoolTransactions = await this.poolTransactionRepository.find({
      where: {
        and: [
          {spvId},
          {isDeleted: false},
          {isSettledProcessed: false},
          {status: ACTIVE_POOL_STATUS},
        ],
      },
    });

    let settledCount = 0;

    for (const poolTransaction of unsettledPoolTransactions) {
      if (poolTransaction.spvId !== spvId) {
        continue;
      }

      const wasSettled = await this.markSettledTransaction(
        poolTransaction.transactionId,
        spvId,
      );

      if (wasSettled) {
        settledCount += 1;
      }
    }

    return {settledCount};
  }

  async recomputePoolFinancials(spvId: string): Promise<PoolFinancials> {
    const poolFinancials = await this.getPoolFinancialsForSpvOrFail(spvId);
    const poolTransactions = await this.poolTransactionRepository.find({
      where: {
        and: [{spvId}, {isDeleted: false}],
      },
    });

    const totalFunded = this.normalizeAmount(
      poolTransactions.reduce(
        (sum, transaction) => sum + Number(transaction.amount ?? 0),
        0,
      ),
    );
    const totalSettled = this.normalizeAmount(
      poolTransactions.reduce((sum, transaction) => {
        if (!transaction.isSettledProcessed) {
          return sum;
        }

        return sum + Number(transaction.amount ?? 0);
      }, 0),
    );
    const outstanding = this.normalizeAmount(totalFunded - totalSettled);

    return this.poolFinancialsService.updateRuntimeTotals(poolFinancials.id, {
      totalFunded,
      totalSettled,
      outstanding,
    });
  }

  async syncSpvPool(spvId: string): Promise<{
    pool: PoolFinancials;
    fundedSync: {addedCount: number; skipped: Array<{transactionId: string; reason: string}>};
    settledSync: {settledCount: number};
  }> {
    const fundedSync = await this.syncFundedTransactions(spvId);
    const settledSync = await this.processSettledTransactions(spvId);
    const pool = await this.recomputePoolFinancials(spvId);

    return {
      pool,
      fundedSync,
      settledSync,
    };
  }
}
