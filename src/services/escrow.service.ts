import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {EscrowTransaction, Transaction} from '../models';
import {EscrowTransactionRepository, TransactionRepository} from '../repositories';
import {SpvService} from './spv.service';

const ESCROW_PENDING_STATUS = 'PENDING';
const ESCROW_MATCHED_STATUS = 'MATCHED';
const TRANSACTION_SETTLED_STATUS = 'SETTLED';

export class EscrowService {
  constructor(
    @repository(EscrowTransactionRepository)
    private escrowTransactionRepository: EscrowTransactionRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
    @inject('service.spv.service')
    private spvService: SpvService,
  ) {}

  private normalizeAmount(amount: number): number {
    return Number(Number(amount ?? 0).toFixed(2));
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
