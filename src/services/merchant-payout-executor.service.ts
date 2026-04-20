import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {
  MerchantPayoutBatch,
  MerchantPayoutBatchItem,
  Transaction,
} from '../models';
import {
  MerchantPayoutBatchItemRepository,
  MerchantPayoutBatchRepository,
  TransactionRepository,
} from '../repositories';
import {isSettlementEligibleForDiscounting} from '../utils/transactions';
import {MerchantPayoutService} from './merchant-payout.service';

const EXECUTABLE_BATCH_STATUSES = ['created', 'pending', 'processing'];
const MERCHANT_FUNDED_STATUS = 'fundeed';
const SIMULATED_PAYOUT_PROVIDER = 'simulated-bank';
const PAYOUT_TRANSACTION_OPTIONS = {
  isolationLevel: 'READ COMMITTED',
} as const;

type BatchItemOutcome = {
  itemId: string;
  success: boolean;
  failureReason?: string;
  providerReferenceId?: string;
  providerResponse?: object;
};

type BatchExecutionSummary = {
  batchId: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  successCount: number;
  failureCount: number;
};

export class MerchantPayoutExecutorService {
  constructor(
    @inject('service.merchantPayoutService.service')
    private merchantPayoutService: MerchantPayoutService,
    @repository(MerchantPayoutBatchRepository)
    private merchantPayoutBatchRepository: MerchantPayoutBatchRepository,
    @repository(MerchantPayoutBatchItemRepository)
    private merchantPayoutBatchItemRepository: MerchantPayoutBatchItemRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
  ) {}

  private isExecutorDebugEnabled() {
    return ['1', 'true', 'yes', 'on'].includes(
      String(process.env.MERCHANT_PAYOUT_EXECUTOR_DEBUG ?? '')
        .trim()
        .toLowerCase(),
    );
  }

  private logExecutorDebug(
    message: string,
    payload?: Record<string, unknown>,
  ) {
    if (!this.isExecutorDebugEnabled()) {
      return;
    }

    if (payload) {
      console.log(message, payload);
      return;
    }

    console.log(message);
  }

  private buildProviderReferenceId(
    batch: MerchantPayoutBatch,
    item: MerchantPayoutBatchItem,
    referenceAt: Date,
  ) {
    return `SIM-${String(batch.id).slice(0, 8)}-${String(item.id).slice(0, 8)}-${referenceAt.getTime()}`;
  }

  private simulateBankTransfer(
    batch: MerchantPayoutBatch,
    item: MerchantPayoutBatchItem,
    transaction: Transaction,
    referenceAt: Date,
  ): BatchItemOutcome {
    const providerReferenceId = this.buildProviderReferenceId(
      batch,
      item,
      referenceAt,
    );

    return {
      itemId: item.id,
      success: true,
      providerReferenceId,
      providerResponse: {
        provider: SIMULATED_PAYOUT_PROVIDER,
        batchId: batch.id,
        transactionId: transaction.id,
        allocatedAmount: Number(item.allocatedAmount ?? 0),
        processedAt: referenceAt.toISOString(),
      },
    };
  }

  private async findDuplicateTransactionIds(
    batchId: string,
    transactionIds: string[],
  ) {
    if (!transactionIds.length) {
      return new Set<string>();
    }

    const competingItems = await this.merchantPayoutBatchItemRepository.find({
      where: {
        and: [
          {transactionId: {inq: transactionIds}},
          {merchantPayoutBatchId: {neq: batchId}},
          {isDeleted: false},
        ],
      },
      fields: {
        transactionId: true,
        merchantPayoutBatchId: true,
      },
    });

    if (!competingItems.length) {
      return new Set<string>();
    }

    const competingBatchIds = Array.from(
      new Set(competingItems.map(item => item.merchantPayoutBatchId)),
    );
    const competingBatches = await this.merchantPayoutBatchRepository.find({
      where: {
        and: [
          {id: {inq: competingBatchIds}},
          {status: {inq: EXECUTABLE_BATCH_STATUSES}},
          {isDeleted: false},
        ],
      },
      fields: {id: true},
    });
    const activeBatchIds = new Set(
      competingBatches.map(batch => String(batch.id)),
    );

    return new Set(
      competingItems
        .filter(item => activeBatchIds.has(String(item.merchantPayoutBatchId)))
        .map(item => item.transactionId),
    );
  }

  private getFailureReason(outcomes: BatchItemOutcome[]) {
    return outcomes
      .filter(outcome => !outcome.success && outcome.failureReason)
      .map(outcome => outcome.failureReason)
      .slice(0, 5)
      .join('; ');
  }

  private async persistBatchOutcomes(
    batch: MerchantPayoutBatch,
    referenceAt: Date,
    outcomes: BatchItemOutcome[],
  ): Promise<BatchExecutionSummary> {
    const tx =
      await this.merchantPayoutBatchRepository.dataSource.beginTransaction(
        PAYOUT_TRANSACTION_OPTIONS,
      );

    try {
      const items = await this.merchantPayoutBatchItemRepository.find(
        {
          where: {
            and: [{merchantPayoutBatchId: batch.id}, {isDeleted: false}],
          },
          order: ['createdAt ASC'],
        },
        {transaction: tx},
      );
      const outcomeByItemId = new Map(
        outcomes.map(outcome => [outcome.itemId, outcome]),
      );
      const successTransactionIds = Array.from(
        new Set(
          items
            .filter(item => outcomeByItemId.get(item.id)?.success)
            .map(item => item.transactionId),
        ),
      );
      const transactions = successTransactionIds.length
        ? await this.transactionRepository.find(
            {
              where: {
                id: {inq: successTransactionIds},
              },
            },
            {transaction: tx},
          )
        : [];
      const transactionById = new Map(
        transactions.map(transaction => [transaction.id, transaction]),
      );

      for (const item of items) {
        const outcome = outcomeByItemId.get(item.id);

        if (!outcome) {
          continue;
        }

        if (outcome.success && item.status !== 'released') {
          const transaction = transactionById.get(item.transactionId);

          if (!transaction) {
            throw new Error(
              `Transaction ${item.transactionId} missing for batch item ${item.id}`,
            );
          }

          const updatedReleasedAmount = Number(
            (
              Number(transaction.releasedAmount ?? 0) +
              Number(item.allocatedAmount ?? 0)
            ).toFixed(2),
          );

          await this.transactionRepository.updateById(
            transaction.id,
            {
              status: MERCHANT_FUNDED_STATUS,
              releasedAmount: updatedReleasedAmount,
              lastReleasedAt: referenceAt,
              updatedAt: referenceAt,
            },
            {transaction: tx},
          );

          await this.merchantPayoutBatchItemRepository.updateById(
            item.id,
            {
              status: 'released',
              providerReferenceId: outcome.providerReferenceId,
              providerResponse: outcome.providerResponse,
              failureReason: undefined,
              updatedAt: referenceAt,
            },
            {transaction: tx},
          );
          continue;
        }

        if (!outcome.success && item.status !== 'released') {
          await this.merchantPayoutBatchItemRepository.updateById(
            item.id,
            {
              status: 'failed',
              failureReason: outcome.failureReason,
              providerReferenceId: outcome.providerReferenceId,
              providerResponse: outcome.providerResponse,
              updatedAt: referenceAt,
            },
            {transaction: tx},
          );
        }
      }

      const refreshedItems = await this.merchantPayoutBatchItemRepository.find(
        {
          where: {
            and: [{merchantPayoutBatchId: batch.id}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );
      const releasedItems = refreshedItems.filter(
        item => item.status === 'released',
      );
      const failedItems = refreshedItems.filter(item => item.status === 'failed');
      const releasedAmount = Number(
        releasedItems
          .reduce((sum, item) => sum + Number(item.allocatedAmount ?? 0), 0)
          .toFixed(2),
      );
      const batchStatus =
        releasedItems.length === refreshedItems.length
          ? 'success'
          : releasedItems.length > 0
            ? 'partial'
            : 'failed';
      const failureReason =
        batchStatus === 'success' ? undefined : this.getFailureReason(outcomes);

      await this.merchantPayoutBatchRepository.updateById(
        batch.id,
        {
          status: batchStatus,
          releasedAmount,
          totalFundedAmount: Number(
            (
              Number(batch.alreadyReleasedToday ?? 0) + Number(releasedAmount ?? 0)
            ).toFixed(2),
          ),
          providerName: SIMULATED_PAYOUT_PROVIDER,
          providerResponse: {
            provider: SIMULATED_PAYOUT_PROVIDER,
            successCount: releasedItems.length,
            failureCount: failedItems.length,
            processedAt: referenceAt.toISOString(),
          },
          failureReason,
          triggeredAt: batch.triggeredAt ?? referenceAt,
          completedAt: referenceAt,
          updatedAt: referenceAt,
        },
        {transaction: tx},
      );

      await tx.commit();

      return {
        batchId: batch.id,
        status: batchStatus,
        successCount: releasedItems.length,
        failureCount: failedItems.length,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async executeBatch(
    batchId: string,
    referenceAt: Date = new Date(),
  ): Promise<BatchExecutionSummary> {
    const batch = await this.merchantPayoutService.markBatchAsProcessing(
      batchId,
      referenceAt,
    );
    const items = await this.merchantPayoutBatchItemRepository.find({
      where: {
        and: [{merchantPayoutBatchId: batch.id}, {isDeleted: false}],
      },
      order: ['createdAt ASC'],
    });

    if (!items.length) {
      await this.merchantPayoutService.markBatchAsFailed(
        batch.id,
        'No payout items found for execution',
        {
          providerName: SIMULATED_PAYOUT_PROVIDER,
          completedAt: referenceAt,
        },
      );

      return {
        batchId: batch.id,
        status: 'failed',
        successCount: 0,
        failureCount: 0,
      };
    }

    const beneficiaryAccount =
      await this.merchantPayoutService.getPrimaryMerchantBankAccount(
        batch.usersId,
      );

    if (!beneficiaryAccount) {
      await this.merchantPayoutService.markBatchAsFailed(
        batch.id,
        'No approved primary merchant bank account found for payout',
        {
          providerName: SIMULATED_PAYOUT_PROVIDER,
          completedAt: referenceAt,
        },
      );

      return {
        batchId: batch.id,
        status: 'failed',
        successCount: 0,
        failureCount: items.length,
      };
    }

    const transactionIds = Array.from(new Set(items.map(item => item.transactionId)));
    const transactions = await this.transactionRepository.find({
      where: {
        id: {inq: transactionIds},
      },
    });
    const transactionById = new Map(
      transactions.map(transaction => [transaction.id, transaction]),
    );
    const duplicateTransactionIds = await this.findDuplicateTransactionIds(
      batch.id,
      transactionIds,
    );
    const outcomes: BatchItemOutcome[] = [];

    for (const item of items) {
      if (item.status === 'released') {
        continue;
      }

      if (item.status === 'failed') {
        continue;
      }

      const transaction = transactionById.get(item.transactionId);

      if (!transaction) {
        outcomes.push({
          itemId: item.id,
          success: false,
          failureReason: 'Transaction missing for payout item',
        });
        continue;
      }

      if (
        transaction.status === MERCHANT_FUNDED_STATUS &&
        Number(transaction.releasedAmount ?? 0) > 0
      ) {
        outcomes.push({
          itemId: item.id,
          success: false,
          failureReason: 'Transaction is already funded',
        });
        continue;
      }

      if (
        transaction.status === MERCHANT_FUNDED_STATUS &&
        Number(transaction.releasedAmount ?? 0) <= 0
      ) {
        outcomes.push({
          itemId: item.id,
          success: false,
          failureReason:
            'Transaction is marked funded without released amount',
        });
        continue;
      }

      if (duplicateTransactionIds.has(item.transactionId)) {
        outcomes.push({
          itemId: item.id,
          success: false,
          failureReason: 'Transaction is allocated in another active batch',
        });
        continue;
      }

      if (!isSettlementEligibleForDiscounting(transaction.pspSettlementStatus)) {
        outcomes.push({
          itemId: item.id,
          success: false,
          failureReason:
            'Transaction settlement status is not eligible for discounting',
        });
        continue;
      }

      outcomes.push(
        this.simulateBankTransfer(batch, item, transaction, referenceAt),
      );
    }

    const summary = await this.persistBatchOutcomes(batch, referenceAt, outcomes);
    this.logExecutorDebug('[MerchantPayoutExecutor] Batch executed', {
      batchId: summary.batchId,
      status: summary.status,
      successCount: summary.successCount,
      failureCount: summary.failureCount,
    });

    return summary;
  }

  async executePendingBatches(referenceAt: Date = new Date()) {
    const batches = await this.merchantPayoutBatchRepository.find({
      where: {
        and: [
          {status: {inq: EXECUTABLE_BATCH_STATUSES}},
          {isDeleted: false},
        ],
      },
      order: ['scheduledFor ASC', 'createdAt ASC'],
    });
    const summaries: BatchExecutionSummary[] = [];

    for (const batch of batches) {
      try {
        summaries.push(await this.executeBatch(batch.id, referenceAt));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown payout execution error';
        console.error(
          `[MerchantPayoutExecutor] Failed batch ${batch.id}: ${message}`,
        );
      }
    }

    return summaries;
  }
}
