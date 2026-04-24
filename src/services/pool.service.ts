import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {PoolFinancials, PoolSummary, Transaction} from '../models';
import {
  PoolFinancialsRepository,
  PoolSummaryRepository,
  PoolTransactionRepository,
  TransactionRepository,
} from '../repositories';
import {PoolFinancialsService} from './pool-financials.service';
import {PtcIssuanceService} from './ptc-issuance.service';
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
    @repository(PoolSummaryRepository)
    private poolSummaryRepository: PoolSummaryRepository,
    @inject('service.poolFinancials.service')
    private poolFinancialsService: PoolFinancialsService,
    @inject('service.ptcIssuance.service')
    private ptcIssuanceService: PtcIssuanceService,
    @inject('service.spv.service')
    private spvService: SpvService,
  ) {}

  private normalizeAmount(amount: number): number {
    return Number(Number(amount ?? 0).toFixed(2));
  }

  private async fetchPoolTransactions(spvId: string) {
    return this.poolTransactionRepository.find({
      where: {
        and: [{spvId}, {isDeleted: false}],
      },
    });
  }

  private async buildComputedPoolSnapshot(
    poolFinancials: PoolFinancials,
    spvId: string,
  ): Promise<PoolFinancials> {
    const poolTransactions = await this.fetchPoolTransactions(spvId);

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

    return new PoolFinancials({
      ...poolFinancials.toJSON(),
      totalFunded,
      totalSettled,
      outstanding: this.normalizeAmount(totalFunded - totalSettled),
    });
  }

  private async buildPoolSummaryPayload(
    poolFinancials: PoolFinancials,
    spvId: string,
  ): Promise<Partial<PoolSummary>> {
    const poolTransactions = await this.fetchPoolTransactions(spvId);
    const totalPoolTransactions = poolTransactions.length;
    const settledPoolTransactions = poolTransactions.filter(
      transaction =>
        Boolean(transaction.isSettledProcessed) ||
        transaction.status === SETTLED_POOL_STATUS,
    ).length;
    const activePoolTransactions = Math.max(
      totalPoolTransactions - settledPoolTransactions,
      0,
    );
    const outstanding = this.normalizeAmount(Number(poolFinancials.outstanding ?? 0));
    const poolLimit = this.normalizeAmount(Number(poolFinancials.poolLimit ?? 0));
    const configuredReserveAmount = this.normalizeAmount(
      Number(poolFinancials.reserveAmount ?? 0),
    );
    const reserveRequiredAmount = this.normalizeAmount(
      (outstanding * Number(poolFinancials.reserveBufferPercent ?? 0)) / 100,
    );

    let label: PoolSummary['status']['label'] = 'Inactive';

    if (poolFinancials.isDeleted) {
      label = 'Deleted';
    } else if (poolFinancials.isActive) {
      label = 'Active';
    }

    return {
      spvId,
      poolFinancialsId: poolFinancials.id,
      asOf: poolFinancials.updatedAt ?? new Date(),
      status: {
        label,
        isActive: Boolean(poolFinancials.isActive),
        isDeleted: Boolean(poolFinancials.isDeleted),
      },
      terms: {
        poolLimit,
        targetYield: this.normalizeAmount(Number(poolFinancials.targetYield ?? 0)),
        maturityDays: this.normalizeAmount(Number(poolFinancials.maturityDays ?? 0)),
        reserveBufferPercent: this.normalizeAmount(
          Number(poolFinancials.reserveBufferPercent ?? 0),
        ),
        reserveAmount: configuredReserveAmount,
        dailyCutoffTime: poolFinancials.dailyCutoffTime ?? null,
      },
      metrics: {
        totalFunded: this.normalizeAmount(Number(poolFinancials.totalFunded ?? 0)),
        totalSettled: this.normalizeAmount(Number(poolFinancials.totalSettled ?? 0)),
        outstanding,
        remainingCapacity: this.normalizeAmount(Math.max(poolLimit - outstanding, 0)),
        utilizationPercent: poolLimit
          ? this.normalizeAmount((outstanding / poolLimit) * 100)
          : 0,
        reserveRequiredAmount,
        reserveShortfallAmount: this.normalizeAmount(
          Math.max(reserveRequiredAmount - configuredReserveAmount, 0),
        ),
        reserveSurplusAmount: this.normalizeAmount(
          Math.max(configuredReserveAmount - reserveRequiredAmount, 0),
        ),
        totalPoolTransactions,
        activePoolTransactions,
        settledPoolTransactions,
      },
      isActive: Boolean(poolFinancials.isActive),
      isDeleted: Boolean(poolFinancials.isDeleted),
      deletedAt: poolFinancials.isDeleted ? poolFinancials.deletedAt ?? new Date() : undefined,
    };
  }

  private async upsertPoolSummary(
    poolFinancials: PoolFinancials,
    spvId: string,
  ): Promise<PoolSummary> {
    const payload = await this.buildPoolSummaryPayload(poolFinancials, spvId);
    const existingSummary = await this.poolSummaryRepository.findOne({
      where: {spvId},
    });

    if (existingSummary) {
      await this.poolSummaryRepository.updateById(existingSummary.id, payload);
      return this.poolSummaryRepository.findById(existingSummary.id);
    }

    return this.poolSummaryRepository.create({
      id: uuidv4(),
      ...payload,
    });
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

  private async getPoolFinancialsForSpvOrFail(
    spvId: string,
    options?: {includeDeleted?: boolean},
  ): Promise<PoolFinancials> {
    const spv = await this.spvService.fetchSpvByIdOrFail(spvId);
    const runtimePool = await this.poolFinancialsService.fetchBySpvId(
      spvId,
      options,
    );

    if (runtimePool) {
      return runtimePool;
    }

    const existingPool = await this.poolFinancialsService.fetchByApplicationId(
      spv.spvApplicationId,
      options,
    );

    if (!existingPool) {
      throw new HttpErrors.NotFound('Pool financials not found for the SPV');
    }

    if (!existingPool.spvId && !existingPool.isDeleted) {
      await this.poolFinancialsService.attachSpv(existingPool.id, spvId);
    }

    if (Boolean(existingPool.spvId) || existingPool.isDeleted === true) {
      return existingPool;
    }

    return this.poolFinancialsRepository.findById(existingPool.id);
  }

  async getPoolBySpvId(spvId: string): Promise<PoolFinancials> {
    try {
      return await this.recomputePoolFinancials(spvId);
    } catch (error) {
      if (!(error instanceof HttpErrors.NotFound)) {
        throw error;
      }

      const deletedPool = await this.getPoolFinancialsForSpvOrFail(spvId, {
        includeDeleted: true,
      });

      return this.buildComputedPoolSnapshot(deletedPool, spvId);
    }
  }

  async getPoolDetailsBySpvId(
    spvId: string,
  ): Promise<{pool: PoolFinancials; poolSummary: PoolSummary}> {
    const pool = await this.getPoolBySpvId(spvId);

    return {
      pool,
      poolSummary: await this.upsertPoolSummary(pool, spvId),
    };
  }

  async addFundedTransactionToPool(
    transactionId: string,
    spvId: string,
  ): Promise<{
    added: boolean;
    reason?: string;
    ptcIssuanceCreated?: boolean;
    ptcIssuanceId?: string | null;
    ptcReason?: string;
  }> {
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
    const ptcResult = await this.ptcIssuanceService.ensureIssuanceForPoolTransaction(
      transaction.id,
      spvId,
    );

    return {
      added: true,
      ptcIssuanceCreated: ptcResult.created,
      ptcIssuanceId: ptcResult.issuance?.id ?? null,
      ptcReason: ptcResult.reason,
    };
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
    const snapshot = await this.buildComputedPoolSnapshot(poolFinancials, spvId);

    if (poolFinancials.isDeleted) {
      await this.upsertPoolSummary(snapshot, spvId);
      return snapshot;
    }

    const updatedPool = await this.poolFinancialsService.updateRuntimeTotals(poolFinancials.id, {
      totalFunded: snapshot.totalFunded,
      totalSettled: snapshot.totalSettled,
      outstanding: snapshot.outstanding,
    });

    await this.upsertPoolSummary(updatedPool, spvId);

    return updatedPool;
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
