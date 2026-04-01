import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import cron, {ScheduledTask} from 'node-cron';
import {v4 as uuidv4} from 'uuid';
import {PspRepository, TransactionRepository} from '../repositories';
import {LiquidityEngineService} from '../services/liquidity-engine.service';
import {PspService} from '../services/psp.service';
import {
  calculateTotalRecieved,
  formatTransactionCharge,
  normalizePaiseToRupees,
  resolveSettlementDetails,
} from '../utils/transactions';

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

    @inject('service.pspService.service')
    private pspService: PspService,

    @inject('service.liquidityEngineService.service')
    private liquidityEngineService: LiquidityEngineService,
  ) { }

  start() {
    if (this.job) {
      return;
    }

    console.log('Transaction cron started...');

    this.job = cron.schedule('*/1 * * * *', async () => {
      console.log('Transaction cron running...');

      const psps = await this.pspRepository.find({
        where: {isActive: true},
        include: [{relation: 'pspMaster'}],
      });

      for (const psp of psps) {
        let transactions: RazorpayPayment[] = [];

        try {
          transactions = (await this.pspService.fetchTransactions(
            psp,
          )) as RazorpayPayment[];
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown PSP sync error';
          console.error(`Transaction sync failed for PSP ${psp.id}: ${message}`);
          continue;
        }

        for (const txn of transactions) {
          const createdAt = new Date(txn.created_at * 1000);
          const isCaptured = Boolean(txn.captured || txn.status === 'captured');
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
          const amountRefund = normalizePaiseToRupees(txn.amount_refunded || 0);

          const exists = await this.transactionRepository.findOne({
            where: {tnsId: txn.id},
          });

          if (exists) {
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
              status: txn.status,
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
              createdAt,
              updatedAt: new Date(),
            });
            continue;
          }

          await this.transactionRepository.create({
            id: uuidv4(),
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
            status: txn.status,
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
            createdAt,
          });

          console.log(`Inserted transaction ${txn.id}`);
        }
      }
    });
  }

  stop() {
    this.job?.stop();
    this.job = undefined;
  }
}
