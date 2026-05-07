import {Getter, inject} from '@loopback/core';
import {Options, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {
  EscrowTransaction,
  EscrowTransactionDirection,
  EscrowTransactionType,
  Transaction,
} from '../models';
import {EscrowTransactionRepository, TransactionRepository} from '../repositories';
import {PoolService} from './pool.service';
import {SpvService} from './spv.service';

const ESCROW_PENDING_STATUS = 'PENDING';
const ESCROW_MATCHED_STATUS = 'MATCHED';
const TRANSACTION_SETTLED_STATUS = 'SETTLED';

export type CreateMatchedEscrowLedgerEntryPayload = {
  transactionId: string;
  spvId: string;
  amount: number;
  transactionType: EscrowTransactionType;
  direction: EscrowTransactionDirection;
  referenceMovementId: string;
};

export class EscrowService {
  constructor(
    @repository(EscrowTransactionRepository)
    private escrowTransactionRepository: EscrowTransactionRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
    @inject('service.spv.service')
    private spvService: SpvService,
    @inject.getter('service.pool.service')
    private poolServiceGetter: Getter<PoolService>,
  ) {}

  private getOptions(tx?: unknown): Options | undefined {
    return tx ? {transaction: tx} : undefined;
  }

  private normalizeAmount(amount: number): number {
    return Number(Number(amount ?? 0).toFixed(2));
  }

  private async triggerPoolRecompute(spvId: string): Promise<void> {
    try {
      const poolService = await this.poolServiceGetter();
      await poolService.recomputePoolFinancials(spvId);
    } catch (error) {
      if (error instanceof HttpErrors.NotFound) {
        return;
      }

      throw error;
    }
  }

  private async findExistingEscrowTransaction(
    transactionId: string,
    spvId: string,
  ): Promise<EscrowTransaction | null> {
    return this.escrowTransactionRepository.findOne({
      where: {
        and: [{transactionId}, {spvId}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });
  }

  private async findExistingLedgerMovement(
    payload: CreateMatchedEscrowLedgerEntryPayload,
    tx?: unknown,
  ): Promise<EscrowTransaction | null> {
    return this.escrowTransactionRepository.findOne(
      {
        where: {
          and: [
            {transactionId: payload.transactionId},
            {spvId: payload.spvId},
            {referenceMovementId: payload.referenceMovementId},
            {transactionType: payload.transactionType},
            {direction: payload.direction},
            {isDeleted: false},
          ],
        },
        order: ['createdAt DESC'],
      },
      this.getOptions(tx),
    );
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

  async recordEscrowTransaction(payload: {
    transactionId: string;
    spvId: string;
    amount: number;
  }): Promise<{
    escrowTransaction: EscrowTransaction;
    settlementApplied: boolean;
  }> {
    const normalizedAmount = this.normalizeAmount(payload.amount);

    if (normalizedAmount <= 0) {
      throw new HttpErrors.BadRequest('Escrow amount must be greater than zero');
    }

    await this.spvService.fetchSpvByIdOrFail(payload.spvId);
    await this.getTransactionForSpvOrFail(payload.transactionId, payload.spvId);

    const escrowTransaction = await this.escrowTransactionRepository.create({
      id: uuidv4(),
      transactionId: payload.transactionId,
      spvId: payload.spvId,
      amount: normalizedAmount,
      status: ESCROW_PENDING_STATUS,
      isActive: true,
      isDeleted: false,
    });

    const settlementApplied = await this.reconcileEscrowTransactionById(
      escrowTransaction.id,
    );

    const persistedEscrowTransaction = await this.escrowTransactionRepository.findById(
      escrowTransaction.id,
    );

    return {
      escrowTransaction: persistedEscrowTransaction,
      settlementApplied,
    };
  }

  async ensureEscrowTransactionForSettledTransaction(payload: {
    transactionId: string;
    spvId: string;
    amount: number;
  }): Promise<{
    escrowTransaction: EscrowTransaction;
    settlementApplied: boolean;
    created: boolean;
  }> {
    const normalizedAmount = this.normalizeAmount(payload.amount);

    if (normalizedAmount <= 0) {
      throw new HttpErrors.BadRequest('Escrow amount must be greater than zero');
    }

    await this.spvService.fetchSpvByIdOrFail(payload.spvId);
    await this.getTransactionForSpvOrFail(payload.transactionId, payload.spvId);

    const existingEscrowTransaction = await this.findExistingEscrowTransaction(
      payload.transactionId,
      payload.spvId,
    );

    if (existingEscrowTransaction) {
      const settlementApplied =
        existingEscrowTransaction.status === ESCROW_PENDING_STATUS
          ? await this.reconcileEscrowTransactionById(existingEscrowTransaction.id)
          : false;

      const persistedEscrowTransaction = await this.escrowTransactionRepository.findById(
        existingEscrowTransaction.id,
      );

      return {
        escrowTransaction: persistedEscrowTransaction,
        settlementApplied,
        created: false,
      };
    }

    const result = await this.recordEscrowTransaction({
      transactionId: payload.transactionId,
      spvId: payload.spvId,
      amount: normalizedAmount,
    });

    return {
      ...result,
      created: true,
    };
  }

  async createMatchedLedgerEntry(
    payload: CreateMatchedEscrowLedgerEntryPayload,
    tx?: unknown,
  ): Promise<EscrowTransaction> {
    const normalizedAmount = this.normalizeAmount(payload.amount);

    if (normalizedAmount <= 0) {
      throw new HttpErrors.BadRequest('Escrow amount must be greater than zero');
    }

    if (!payload.referenceMovementId?.trim()) {
      throw new HttpErrors.BadRequest('referenceMovementId is required');
    }

    await this.spvService.fetchSpvByIdOrFail(payload.spvId);

    const existingMovement = await this.findExistingLedgerMovement(payload, tx);
    if (existingMovement) {
      return existingMovement;
    }

    return this.escrowTransactionRepository.create(
      {
        id: uuidv4(),
        transactionId: payload.transactionId,
        spvId: payload.spvId,
        amount: normalizedAmount,
        transactionType: payload.transactionType,
        direction: payload.direction,
        referenceMovementId: payload.referenceMovementId,
        status: ESCROW_MATCHED_STATUS,
        matchedAt: new Date(),
        isActive: true,
        isDeleted: false,
      },
      this.getOptions(tx),
    );
  }

  async reconcileEscrowTransactionById(escrowTransactionId: string): Promise<boolean> {
    const escrowTransaction = await this.escrowTransactionRepository.findById(
      escrowTransactionId,
    );

    if (escrowTransaction.isDeleted || !escrowTransaction.isActive) {
      return false;
    }

    if (escrowTransaction.status !== ESCROW_PENDING_STATUS) {
      return false;
    }

    const transaction = await this.getTransactionForSpvOrFail(
      escrowTransaction.transactionId,
      escrowTransaction.spvId,
    );

    if (
      escrowTransaction.spvId !== transaction.spvId ||
      !transaction.spvId
    ) {
      return false;
    }

    if (this.normalizeAmount(escrowTransaction.amount) < this.normalizeAmount(transaction.amount)) {
      return false;
    }

    if (String(transaction.pspSettlementStatus).toUpperCase() !== TRANSACTION_SETTLED_STATUS) {
      await this.transactionRepository.updateById(transaction.id, {
        pspSettlementStatus: TRANSACTION_SETTLED_STATUS,
      });
    }

    await this.escrowTransactionRepository.updateById(escrowTransaction.id, {
      status: ESCROW_MATCHED_STATUS,
      matchedAt: new Date(),
    });

    await this.triggerPoolRecompute(escrowTransaction.spvId);

    return true;
  }

  async reconcileSpvEscrow(spvId: string): Promise<{
    processed: number;
    matched: number;
    pending: number;
  }> {
    await this.spvService.fetchSpvByIdOrFail(spvId);

    const escrowTransactions = await this.escrowTransactionRepository.find({
      where: {
        and: [{spvId}, {isDeleted: false}, {status: ESCROW_PENDING_STATUS}],
      },
      order: ['createdAt ASC'],
    });

    let matched = 0;

    for (const escrowTransaction of escrowTransactions) {
      if (escrowTransaction.spvId !== spvId) {
        continue;
      }

      const wasMatched = await this.reconcileEscrowTransactionById(
        escrowTransaction.id,
      );

      if (wasMatched) {
        matched += 1;
      }
    }

    return {
      processed: escrowTransactions.length,
      matched,
      pending: escrowTransactions.length - matched,
    };
  }

}
