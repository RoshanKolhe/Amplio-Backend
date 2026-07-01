/* eslint-disable @typescript-eslint/naming-convention */
import {v4 as uuidv4} from 'uuid';
import {TransactionRepository} from '../repositories';

const ENABLED_FLAG_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isFlagEnabled(envVar: string): boolean {
  return ENABLED_FLAG_VALUES.has(
    String(process.env[envVar] ?? '').trim().toLowerCase(),
  );
}

function readIntEnv(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type SyntheticRazorpayPayment = {
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

const METHODS = ['upi', 'upi', 'upi', 'card', 'card', 'netbanking'];
const BANKS = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'YES'];
const UPI_VPAS = [
  'merchant@upi',
  'payments@hdfc',
  'shop@icici',
  'store@oksbi',
  'sales@ybl',
  'billing@paytm',
  'vendor@axisbank',
];

const STATUS_POOL = [
  'captured', 'captured', 'captured', 'captured', 'captured',
  'captured', 'captured',
  'authorized',
  'failed', 'failed',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function pspSlug(pspId: string): string {
  const slug = pspId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  return slug || 'psp';
}

export class SyntheticTransactionService {
  static isSyntheticEnabled(): boolean {
    return isFlagEnabled('ENABLE_SYNTHETIC_TRANSACTIONS');
  }

  static isRealPspSyncDisabled(): boolean {
    return isFlagEnabled('DISABLE_REAL_PSP_SYNC');
  }

  static isMerchantVerificationBypassed(): boolean {
    return isFlagEnabled('BYPASS_MERCHANT_VERIFICATION');
  }

  static generateForPsp(pspId: string, referenceDate: Date): SyntheticRazorpayPayment[] {
    const minCount = readIntEnv('SYNTHETIC_TRANSACTION_MIN_COUNT', 40);
    const maxCount = readIntEnv('SYNTHETIC_TRANSACTION_MAX_COUNT', 50);
    const dailyTargetMinInr = readIntEnv('SYNTHETIC_DAILY_TARGET_MIN', 5_000_000);
    const dailyTargetMaxInr = readIntEnv('SYNTHETIC_DAILY_TARGET_MAX', 20_000_000);

    const count = randInt(minCount, maxCount);
    const dailyTargetInr = randInt(dailyTargetMinInr, dailyTargetMaxInr);
    const dateStr = formatDateStr(referenceDate);
    const slug = pspSlug(pspId);

    // Spread transactions across an 8 AM–10 PM IST window (50400 seconds)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(referenceDate);
    const year = parseInt(parts.find(p => p.type === 'year')!.value, 10);
    const month = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
    const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);

    const paddedMonth = String(month + 1).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');
    const dayStart8amUtc = new Date(`${year}-${paddedMonth}-${paddedDay}T02:30:00.000Z`);
    const windowStart = Math.floor(dayStart8amUtc.getTime() / 1000);

    // Distribute INR amounts across transactions with ±30% variance, min ₹1 lakh each
    const baseAmountInr = Math.floor(dailyTargetInr / count);
    const amounts: number[] = [];
    let allocated = 0;
    for (let i = 0; i < count - 1; i++) {
      const variance = randInt(
        -Math.floor(baseAmountInr * 0.3),
        Math.floor(baseAmountInr * 0.3),
      );
      const amt = Math.max(baseAmountInr + variance, 100_000);
      amounts.push(amt);
      allocated += amt;
    }
    amounts.push(Math.max(dailyTargetInr - allocated, 100_000));

    const transactions: SyntheticRazorpayPayment[] = [];

    for (let i = 0; i < count; i++) {
      const amountInr = amounts[i];
      const amountPaise = amountInr * 100;
      const status = pick(STATUS_POOL);
      const method = pick(METHODS);
      const isCaptured = status === 'captured';

      // Realistic fee: 0.80%–2.00% of amount; GST at 18% on fee
      const feeRateBps = randInt(80, 200);
      const feeInr = Number(((amountInr * feeRateBps) / 10_000).toFixed(2));
      const taxInr = Number((feeInr * 0.18).toFixed(2));

      const randomSuffix = uuidv4().replace(/-/g, '').slice(0, 6);
      const tnsId = `syn_${dateStr}_${slug}_${String(i + 1).padStart(4, '0')}_${randomSuffix}`;
      const orderId = `synord_${dateStr}_${String(i + 1).padStart(4, '0')}_${uuidv4().slice(0, 8)}`;
      const createdAt = windowStart + randInt(0, 50400);

      const txn: SyntheticRazorpayPayment = {
        id: tnsId,
        order_id: orderId,
        amount: amountPaise,
        currency: 'INR',
        status,
        method,
        bank: method !== 'upi' ? pick(BANKS) : undefined,
        captured: isCaptured,
        amount_refunded: 0,
        fee: isCaptured ? String(feeInr) : undefined,
        tax: isCaptured ? String(taxInr) : undefined,
        vpa: method === 'upi' ? pick(UPI_VPAS) : undefined,
        upi:
          method === 'upi'
            ? {flow: 'intent', payer_bank_account: {ifsc: `${pick(BANKS)}0000001`}}
            : undefined,
        created_at: createdAt,
      };

      transactions.push(txn);
    }

    return transactions;
  }

  static async hasSyntheticTransactionsForToday(
    pspId: string,
    transactionRepository: TransactionRepository,
    date: Date,
  ): Promise<boolean> {
    const dateStr = formatDateStr(date);
    const slug = pspSlug(pspId);
    const prefix = `syn_${dateStr}_${slug}_`;

    const existing = await transactionRepository.find({
      where: {
        and: [
          {tnsId: {like: `${prefix}%`}},
          {pspId},
          {isDeleted: false},
        ],
      },
      fields: {id: true},
      limit: 1,
    });

    return existing.length > 0;
  }
}
