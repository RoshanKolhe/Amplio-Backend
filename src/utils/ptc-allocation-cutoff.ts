export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Allocation cutoff: investments with UTR submitted before this hour (IST) are
 * allocated same-day and earn today's interest. After this hour → next business day.
 *
 * Intentionally separate from the 17:00 withdrawal/redemption cutoff (T+1 vs T+2).
 */
export const ALLOCATION_CUTOFF_HOUR = 15;

/**
 * Fixed 3 PM IST cutoff for investor allocation and interest eligibility.
 * This is a business rule constant — NOT read from pool/merchant config.
 * Merchant payout windows (eveningCutoffTime, dailyCutoffTime) are unrelated.
 */
export const INVESTOR_ALLOCATION_CUTOFF_IST = '15:00';

/**
 * Returns true when `nowUtc` falls before the 3 PM IST allocation cutoff.
 * `eveningCutoffStr` is in "HH:MM" or "HH:MM:SS" format; defaults to INVESTOR_ALLOCATION_CUTOFF_IST.
 */
export function isBeforeAllocationCutoff(nowUtc: Date, eveningCutoffStr = INVESTOR_ALLOCATION_CUTOFF_IST): boolean {
  const istNow = new Date(nowUtc.getTime() + IST_OFFSET_MS);
  const [eh, em] = eveningCutoffStr.split(':').map(Number);
  const nowMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const eveningMinutes = eh * 60 + em;
  return nowMinutes < eveningMinutes;
}

/**
 * Returns today's IST calendar date (at 00:00 UTC) when `nowUtc` is before the
 * allocation cutoff, otherwise the next business day (skipping weekends).
 */
export function computeAllocationDate(nowUtc: Date, eveningCutoffStr = INVESTOR_ALLOCATION_CUTOFF_IST): Date {
  const istNow = new Date(nowUtc.getTime() + IST_OFFSET_MS);
  const base = new Date(istNow.toISOString().split('T')[0] + 'T00:00:00.000Z');

  if (!isBeforeAllocationCutoff(nowUtc, eveningCutoffStr)) {
    base.setUTCDate(base.getUTCDate() + 1);
    while (base.getUTCDay() === 0 || base.getUTCDay() === 6) {
      base.setUTCDate(base.getUTCDate() + 1);
    }
  }

  return base;
}

/**
 * Calculates the number of days interest has accrued for an investment holding.
 *
 * Preferred path (new holdings): pass `allocationDate` — the effective start
 * date computed at UTR submission time by `computeAllocationDate`. This date
 * already encodes the 3 PM IST cutoff and weekend-skipping, so no re-derivation
 * is needed. dayDiff = today (IST) − allocationDate.
 *
 * Legacy fallback (holdings without allocationDate): derives effectiveStart from
 * `holdingCreatedAtUtc` using the 3 PM IST rule, also skipping weekends.
 *
 * @param holdingCreatedAtUtc  UTC timestamp the DB record was created.
 * @param nowUtc               UTC "now" (injectable for testing).
 * @param allocationDate       Explicit effective start date (preferred, nullable for legacy).
 */
export function calculateAccruedInterestDays(
  holdingCreatedAtUtc: Date,
  nowUtc: Date,
  allocationDate?: Date | null,
): number {
  let effectiveStart: Date;

  if (allocationDate) {
    // allocationDate is stored as midnight-UTC of the IST calendar allocation day,
    // same convention as computeAllocationDate returns. Use it directly.
    effectiveStart = new Date(allocationDate.getTime());
  } else {
    // Legacy fallback: re-derive from the actual DB creation timestamp.
    effectiveStart = new Date(holdingCreatedAtUtc.getTime() + IST_OFFSET_MS);
    if (effectiveStart.getUTCHours() >= ALLOCATION_CUTOFF_HOUR) {
      effectiveStart.setUTCDate(effectiveStart.getUTCDate() + 1);
      // Skip weekends so Friday-after-3PM doesn't produce Saturday as effectiveStart.
      while (effectiveStart.getUTCDay() === 0 || effectiveStart.getUTCDay() === 6) {
        effectiveStart.setUTCDate(effectiveStart.getUTCDate() + 1);
      }
    }
    effectiveStart.setUTCHours(0, 0, 0, 0);
  }

  const todayStart = new Date(nowUtc.getTime() + IST_OFFSET_MS);
  todayStart.setUTCHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const dayDiff = Math.floor(
    (todayStart.getTime() - effectiveStart.getTime()) / msPerDay,
  );
  return Math.max(dayDiff, 0);
}
