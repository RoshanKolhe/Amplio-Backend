import {v4 as uuidv4} from 'uuid';

const methods = ["upi", "card", "netbanking"];
const banks = ["HDFC", "ICICI", "SBI", "AXIS"];
const statusList = ["captured", "authorized", "failed"];
const MILLISECONDS_IN_A_DAY = 1000 * 60 * 60 * 24;
const MAX_SETTLEMENT_DAYS = 8;
const PAISE_IN_RUPEE = 100;

export function normalizePaiseToRupees(value?: number | string | null) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const parsedValue =
    typeof value === 'number' ? value : Number.parseFloat(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Number((parsedValue / PAISE_IN_RUPEE).toFixed(2));
}

export function roundTransactionAmount(amount: number) {
  return Math.round(normalizePaiseToRupees(amount));
}

export function parseTransactionCharge(value?: number | string | null) {
  return normalizePaiseToRupees(value);
}

export function formatTransactionCharge(value?: number | string | null) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return normalizePaiseToRupees(value).toFixed(2);
}

export function calculateTotalRecieved(
  amountInRupees: number,
  taxInRupees?: number | string | null,
  feeInRupees?: number | string | null,
) {
  const parsedTax =
    taxInRupees === undefined || taxInRupees === null || taxInRupees === ''
      ? 0
      : Number.parseFloat(String(taxInRupees));
  const parsedFee =
    feeInRupees === undefined || feeInRupees === null || feeInRupees === ''
      ? 0
      : Number.parseFloat(String(feeInRupees));

  return Number(
    (
      amountInRupees -
      (Number.isFinite(parsedTax) ? parsedTax : 0) -
      (Number.isFinite(parsedFee) ? parsedFee : 0)
    ).toFixed(2),
  );
}

export function generateTransactions(count = 5) {
  const transactions = [];

  for (let i = 0; i < count; i++) {
    const method = methods[Math.floor(Math.random() * methods.length)];
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const status = statusList[Math.floor(Math.random() * statusList.length)];

    const createdAt = new Date();

    transactions.push({
      id: `pay_${uuidv4()}`,
      order_id: `order_${uuidv4()}`,
      amount: Math.floor(Math.random() * 300000) + 50000,
      currency: "INR",
      method,
      bank,
      status,
      captured: status === "captured",
      created_at: Math.floor(createdAt.getTime() / 1000),
    });
  }

  return transactions;
}

export function generateSettlementDate(createdAt: Date) {
  const daysToAdd = Math.floor(Math.random() * 8) + 1;

  const settlementDate = new Date(createdAt);
  settlementDate.setDate(settlementDate.getDate() + daysToAdd);

  return settlementDate;
}

export function generateSettlementMethod(createdAt: Date, settlementDate: Date) {
  const diffDays = getSettlementDayGap(createdAt, settlementDate);

  return `T+${diffDays}`;
}

export function inferSettlementDate(
  createdAt: Date,
  referenceDate: Date = new Date(),
  maxSettlementDays = MAX_SETTLEMENT_DAYS,
) {
  const elapsedDays = getSettlementDayGap(createdAt, referenceDate);
  const settlementDate = new Date(createdAt);

  settlementDate.setDate(
    settlementDate.getDate() + Math.min(elapsedDays, maxSettlementDays),
  );

  return settlementDate;
}

export function getSettlementDayGap(
  createdAt: Date,
  settlementDate: Date,
  maxSettlementDays = MAX_SETTLEMENT_DAYS,
) {
  const createdDateOnly = new Date(createdAt);
  const settlementDateOnly = new Date(settlementDate);

  createdDateOnly.setHours(0, 0, 0, 0);
  settlementDateOnly.setHours(0, 0, 0, 0);

  const diffTime = settlementDateOnly.getTime() - createdDateOnly.getTime();
  const diffDays = Math.round(diffTime / MILLISECONDS_IN_A_DAY);

  return Math.min(Math.max(diffDays, 1), maxSettlementDays);
}

export function resolveSettlementDetails(
  createdAt: Date,
  settlementDate?: Date | string | null,
  referenceDate: Date = new Date(),
) {
  const resolvedSettlementDate = settlementDate
    ? new Date(settlementDate)
    : inferSettlementDate(createdAt, referenceDate);

  return {
    settlementDate: resolvedSettlementDate,
    settlementMethod: generateSettlementMethod(createdAt, resolvedSettlementDate),
  };
}
