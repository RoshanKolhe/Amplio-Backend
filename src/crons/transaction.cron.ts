/* eslint-disable @typescript-eslint/naming-convention */
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import cron, {ScheduledTask} from 'node-cron';
import {v4 as uuidv4} from 'uuid';
import {SpvWithRelations} from '../models';
import {
  PspRepository,
  SpvRepository,
  TransactionRepository,
} from '../repositories';
import {EscrowService} from '../services/escrow.service';
import {LiquidityEngineService} from '../services/liquidity-engine.service';
import {PspService} from '../services/psp.service';
import {
  calculateTotalRecieved,
  formatTransactionCharge,
  normalizePaiseToRupees,
  resolvePspSettlementStatus,
  resolveSettlementDetails,
} from '../utils/transactions';

const TRANSACTION_CRON_SCHEDULE = '*/1 * * * *';
const ENABLED_DEBUG_VALUES = new Set(['1', 'true', 'yes', 'on']);
const MERCHANT_FUNDED_STATUS = 'fundeed';
const MERCHANT_NOT_FUNDED_STATUS = 'notfunded';

type RazorpayPayment = {
  id: string;
  order_id?: string;
  amount: number;
  currency?: string;
  status?: string;
  method?: string;
  bank?: string;
  captured?: boolean;
  amount_refunded?: number;
  refund_status?: string;
  card_id?: string;
  tax?: string;
  fee?: string;
  vpa?: string;
  upi?: object;
  acquirer_data?: object;
  created_at: number;
};

export class TransactionCron {
  private job?: ScheduledTask;

  constructor(
    @repository(TransactionRepository)
    public transactionRepository: TransactionRepository,

    @repository(PspRepository)
    public pspRepository: PspRepository,

    @repository(SpvRepository)
    public spvRepository: SpvRepository,

    @inject('service.pspService.service')
    private pspService: PspService,

    @inject('service.liquidityEngineService.service')
    private liquidityEngineService: LiquidityEngineService,

    @inject('service.escrow.service')
    private escrowService: EscrowService,
  ) { }

  private isTransactionCronDebugEnabled() {
    return ENABLED_DEBUG_VALUES.has(
      String(process.env.TRANSACTION_CRON_DEBUG ?? '')
        .trim()
        .toLowerCase(),
    );
  }

  private logTransactionCronDebug(
    message: string,
    payload?: Record<string, unknown>,
  ) {
    if (!this.isTransactionCronDebugEnabled()) {
      return;
    }

    if (payload) {
      console.log(message, payload);
      return;
    }

    console.log(message);
  }

  private resolvePlatformStatus(transaction?: {
    status?: string;
    releasedAmount?: number;
    lastReleasedAt?: Date;
  }) {
    if (
      transaction?.status === MERCHANT_FUNDED_STATUS ||
      Number(transaction?.releasedAmount ?? 0) > 0 ||
      transaction?.lastReleasedAt
    ) {
      return MERCHANT_FUNDED_STATUS;
    }

    return MERCHANT_NOT_FUNDED_STATUS;
  }

  private isFundedTransaction(transaction?: {
    status?: string;
    releasedAmount?: number;
    lastReleasedAt?: Date;
  }) {
    return (
      transaction?.status === MERCHANT_FUNDED_STATUS ||
      Number(transaction?.releasedAmount ?? 0) > 0 ||
      !!transaction?.lastReleasedAt
    );
  }

  private chooseCanonicalTransaction(
    transactions: Array<{
      id: string;
      pspId: string;
      status?: string;
      releasedAmount?: number;
      lastReleasedAt?: Date;
      createdAt?: Date;
    }>,
    preferredPspId: string,
  ) {
    if (!transactions.length) {
      return undefined;
    }

    const samePspTransaction = transactions.find(
      transaction => transaction.pspId === preferredPspId,
    );

    if (samePspTransaction) {
      return samePspTransaction;
    }

    return [...transactions].sort((left, right) => {
      const releasedAmountDiff =
        Number(right.releasedAmount ?? 0) - Number(left.releasedAmount ?? 0);

      if (releasedAmountDiff !== 0) {
        return releasedAmountDiff;
      }

      const fundedDiff =
        Number(this.isFundedTransaction(right)) -
        Number(this.isFundedTransaction(left));

      if (fundedDiff !== 0) {
        return fundedDiff;
      }

      const lastReleasedAtDiff =
        new Date(right.lastReleasedAt ?? 0).getTime() -
        new Date(left.lastReleasedAt ?? 0).getTime();

      if (lastReleasedAtDiff !== 0) {
        return lastReleasedAtDiff;
      }

      const createdAtDiff =
        new Date(left.createdAt ?? 0).getTime() -
        new Date(right.createdAt ?? 0).getTime();

      if (createdAtDiff !== 0) {
        return createdAtDiff;
      }

      return String(left.id).localeCompare(String(right.id));
    })[0];
  }

  private async findExistingTransactionForSync(psp: {
    id: string;
    pspMasterId: string;
  }, tnsId: string): Promise<
    | {
        id: string;
        pspId: string;
        spvId?: string;
        status?: string;
        releasedAmount?: number;
        lastReleasedAt?: Date;
        createdAt?: Date;
      }
    | undefined
  > {
    const existingTransactions = await this.transactionRepository.find({
      where: {
        and: [{tnsId}, {isDeleted: false}],
      },
      fields: {
        id: true,
        pspId: true,
        spvId: true,
        status: true,
        releasedAmount: true,
        lastReleasedAt: true,
        createdAt: true,
      },
    });

    if (!existingTransactions.length) {
      return undefined;
    }

    const existingPspIds = Array.from(
      new Set(existingTransactions.map(transaction => transaction.pspId)),
    );
    const existingPsps = existingPspIds.length
      ? await this.pspRepository.find({
          where: {
            id: {inq: existingPspIds},
          },
          fields: {
            id: true,
            pspMasterId: true,
          },
        })
      : [];
    const pspMasterIdByPspId = new Map(
      existingPsps.map(existingPsp => [existingPsp.id, existingPsp.pspMasterId]),
    );
    const sameProviderTransactions = existingTransactions.filter(
      transaction =>
        transaction.pspId === psp.id ||
        pspMasterIdByPspId.get(transaction.pspId) === psp.pspMasterId,
    );

    if (!sameProviderTransactions.length) {
      return undefined;
    }

    const canonicalTransaction = this.chooseCanonicalTransaction(
      sameProviderTransactions,
      psp.id,
    );

    if (canonicalTransaction && canonicalTransaction.pspId !== psp.id) {
      this.logTransactionCronDebug(
        '[TransactionCron] Duplicate PSP feed detected for existing transaction',
        {
          tnsId,
          incomingPspId: psp.id,
          incomingPspMasterId: psp.pspMasterId,
          canonicalTransactionId: canonicalTransaction.id,
          canonicalPspId: canonicalTransaction.pspId,
        },
      );
    }

    return canonicalTransaction;
  }

  private async resolveActiveSpvIdForPspMaster(
    pspId: string,
    pspMasterId: string,
    cache: Map<string, Promise<string | undefined>>,
  ): Promise<string | undefined> {
    if (!cache.has(pspMasterId)) {
      cache.set(
        pspMasterId,
        (async () => {
          const spvs = (await this.spvRepository.find({
            where: {
              and: [{pspMasterId}, {isDeleted: false}, {isActive: true}],
            },
            include: [{relation: 'spvApplication'}],
          })) as SpvWithRelations[];

          const activeSpvs = spvs.filter(
            spv => spv.spvApplication?.status === 1,
          );

          if (!activeSpvs.length) {
            console.warn('No active SPV found for PSP:', pspId);
            return undefined;
          }

          if (activeSpvs.length > 1) {
            console.error('Multiple SPVs found for PSP:', pspId);
            return undefined;
          }

          return activeSpvs[0].id;
        })(),
      );
    }

    return cache.get(pspMasterId)!;
  }

  start() {
    if (this.job) {
      return;
    }

    console.log(
      `[TransactionCron] Scheduling transaction cron with expression "${TRANSACTION_CRON_SCHEDULE}"`,
    );

    this.job = cron.schedule(TRANSACTION_CRON_SCHEDULE, async () => {
      const referenceAt = new Date();
      console.log(`[TransactionCron] Tick started at ${referenceAt.toISOString()}`);

      const psps = await this.pspRepository.find({
        where: {isActive: true},
        include: [{relation: 'pspMaster'}],
      });

      let totalFetchedTransactions = 0;
      let totalCreatedTransactions = 0;
      let totalUpdatedTransactions = 0;
      const spvResolutionCache = new Map<string, Promise<string | undefined>>();

      for (const psp of psps) {
        let transactions: RazorpayPayment[] = [];

        try {
          transactions = (await this.pspService.fetchTransactions(
            psp,
          )) as RazorpayPayment[];
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown PSP sync error';
          console.error(
            `[TransactionCron] Failed to sync PSP ${psp.id}: ${message}`,
          );
          continue;
        }

        let createdTransactions = 0;
        let updatedTransactions = 0;
        totalFetchedTransactions += transactions.length;

        // this.logTransactionCronDebug(
        //   '[TransactionCron] PSP fetch completed',
        //   {
        //     pspId: psp.id,
        //     usersId: psp.usersId,
        //     merchantProfilesId: psp.merchantProfilesId,
        //     fetchedCount: transactions.length,
        //   },
        // );

        for (const txn of transactions) {
          const createdAt = new Date(txn.created_at * 1000);
          const isCaptured = Boolean(
            txn.captured ?? (txn.status === 'captured'),
          );
          const settlementDetails = isCaptured
            ? resolveSettlementDetails(createdAt)
            : {settlementDate: undefined, settlementMethod: undefined};
          const amountInRupees = normalizePaiseToRupees(txn.amount);
          const normalizedTax = formatTransactionCharge(txn.tax);
          const normalizedFee = formatTransactionCharge(txn.fee);
          const totalRecieved = calculateTotalRecieved(
            amountInRupees,
            normalizedTax,
            normalizedFee,
          );
          const liquidityMetrics = isCaptured
            ? this.liquidityEngineService.calculateLiquidity(
              totalRecieved,
              settlementDetails.settlementMethod,
            )
            : {
              riskScore: 0,
              delayRisk: 0,
              chargebackRisk: 0,
              haircut: 0,
              netAmount: totalRecieved,
            };
          const amountRefund = normalizePaiseToRupees(txn.amount_refunded ?? 0);
          const resolvedSpvId = await this.resolveActiveSpvIdForPspMaster(
            psp.id,
            psp.pspMasterId,
            spvResolutionCache,
          );

          const exists = await this.findExistingTransactionForSync(psp, txn.id);
          const resolvedPspSettlementStatus = resolvePspSettlementStatus(
            txn.status,
            createdAt,
            settlementDetails.settlementDate,
            exists ? new Date() : referenceAt,
          );

          if (exists) {
            const resolvedPlatformStatus = this.resolvePlatformStatus(exists);
            const updatedAt = new Date();
            // console.log('Assigning SPV:', exists.id, psp.id, resolvedSpvId);

            await this.transactionRepository.updateById(exists.id, {
              orderId: txn.order_id,
              amount: amountInRupees,
              totalRecieved,
              riskScore: liquidityMetrics.riskScore,
              delayRisk: liquidityMetrics.delayRisk,
              chargebackRisk: liquidityMetrics.chargebackRisk,
              haircut: liquidityMetrics.haircut,
              netAmount: liquidityMetrics.netAmount,
              currency: txn.currency,
              status: resolvedPlatformStatus,
              pspStatus: txn.status,
              pspSettlementStatus: resolvedPspSettlementStatus,
              method: txn.method,
              bank: txn.bank,
              captured: isCaptured,
              amountRefund,
              amountRefundStatus: txn.refund_status,
              cardId: txn.card_id,
              vpa: txn.vpa,
              upi: txn.upi,
              tax: normalizedTax,
              fee: normalizedFee,
              acquirerData: txn.acquirer_data,
              settlementMethod: settlementDetails.settlementMethod,
              settlementDate: settlementDetails.settlementDate,
              spvId: resolvedSpvId ?? exists.spvId,
              createdAt,
              updatedAt,
            });
            this.logTransactionCronDebug(
              '[TransactionCron] Updated transaction status fields',
              {
                transactionId: exists.id,
                tnsId: txn.id,
                pspId: psp.id,
                pspStatus: txn.status,
                pspSettlementStatus: resolvedPspSettlementStatus,
                status: resolvedPlatformStatus,
                releasedAmount: exists.releasedAmount,
                lastReleasedAt: exists.lastReleasedAt?.toISOString(),
              },
            );

            if (resolvedSpvId && resolvedPspSettlementStatus === 'SETTLED') {
              await this.escrowService.ensureEscrowTransactionForSettledTransaction({
                transactionId: exists.id,
                spvId: resolvedSpvId,
                amount: amountInRupees,
              });
            }

            updatedTransactions += 1;
            continue;
          }

          const transactionId = uuidv4();
          // console.log('Assigning SPV:', transactionId, psp.id, resolvedSpvId);

          await this.transactionRepository.create({
            id: transactionId,
            tnsId: txn.id,
            orderId: txn.order_id,
            amount: amountInRupees,
            totalRecieved,
            riskScore: liquidityMetrics.riskScore,
            delayRisk: liquidityMetrics.delayRisk,
            chargebackRisk: liquidityMetrics.chargebackRisk,
            haircut: liquidityMetrics.haircut,
            netAmount: liquidityMetrics.netAmount,
            currency: txn.currency,
            status: MERCHANT_NOT_FUNDED_STATUS,
            pspStatus: txn.status,
            pspSettlementStatus: resolvedPspSettlementStatus,
            method: txn.method,
            bank: txn.bank,
            captured: isCaptured,
            amountRefund,
            amountRefundStatus: txn.refund_status,
            cardId: txn.card_id,
            tax: normalizedTax,
            fee: normalizedFee,
            vpa: txn.vpa,
            upi: txn.upi,
            acquirerData: txn.acquirer_data,
            settlementMethod: settlementDetails.settlementMethod,
            settlementDate: settlementDetails.settlementDate,
            pspId: psp.id,
            spvId: resolvedSpvId,
            createdAt,
          });
          this.logTransactionCronDebug(
            '[TransactionCron] Created transaction status fields',
            {
              tnsId: txn.id,
              pspId: psp.id,
              pspStatus: txn.status,
              pspSettlementStatus: resolvedPspSettlementStatus,
              status: MERCHANT_NOT_FUNDED_STATUS,
            },
          );

          if (resolvedSpvId && resolvedPspSettlementStatus === 'SETTLED') {
            await this.escrowService.ensureEscrowTransactionForSettledTransaction({
              transactionId,
              spvId: resolvedSpvId,
              amount: amountInRupees,
            });
          }

          createdTransactions += 1;
        }

        totalCreatedTransactions += createdTransactions;
        totalUpdatedTransactions += updatedTransactions;

        // this.logTransactionCronDebug(
        //   '[TransactionCron] PSP sync summary',
        //   {
        //     pspId: psp.id,
        //     usersId: psp.usersId,
        //     merchantProfilesId: psp.merchantProfilesId,
        //     fetchedCount: transactions.length,
        //     createdCount: createdTransactions,
        //     updatedCount: updatedTransactions,
        //   },
        // );
      }

      console.log(
        `[TransactionCron] Tick finished at ${referenceAt.toISOString()} for ${psps.length} PSP(s); fetched=${totalFetchedTransactions}, created=${totalCreatedTransactions}, updated=${totalUpdatedTransactions}`,
      );
    });
  }

  stop() {
    const stopResult = this.job?.stop();

    if (stopResult instanceof Promise) {
      stopResult.catch(() => undefined);
    }

    this.job = undefined;
  }
}
