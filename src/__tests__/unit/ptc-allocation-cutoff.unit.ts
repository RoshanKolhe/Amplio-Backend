import {expect} from '@loopback/testlab';
import {
  isBeforeAllocationCutoff,
  computeAllocationDate,
  calculateAccruedInterestDays,
  IST_OFFSET_MS,
} from '../../utils/ptc-allocation-cutoff';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a UTC Date corresponding to the given IST wall-clock time. */
function makeIstTime(
  year: number,
  month: number, // 1-based
  day: number,
  hourIst: number,
  minuteIst = 0,
): Date {
  const utcMs = Date.UTC(year, month - 1, day, hourIst, minuteIst) - IST_OFFSET_MS;
  return new Date(utcMs);
}

/**
 * Returns the IST calendar date string ("YYYY-MM-DD") stored in a Date that
 * was produced by computeAllocationDate (midnight-UTC of IST calendar day).
 */
function istDateStr(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().split('T')[0];
}

// ─── isBeforeAllocationCutoff ────────────────────────────────────────────────

describe('isBeforeAllocationCutoff', () => {
  it('returns true at 2:59 PM IST', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 14, 59))).to.be.true();
  });

  it('returns false at exactly 3:00 PM IST', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 15, 0))).to.be.false();
  });

  it('returns false at 3:01 PM IST', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 15, 1))).to.be.false();
  });

  it('returns false at 4:59 PM IST', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 16, 59))).to.be.false();
  });

  it('returns false at 5:00 PM IST', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 17, 0))).to.be.false();
  });

  it('returns true at 9:00 AM IST', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 9, 0))).to.be.true();
  });

  it('respects a custom cutoff string "16:00"', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 15, 59), '16:00')).to.be.true();
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 16, 0), '16:00')).to.be.false();
  });
});

// ─── computeAllocationDate ───────────────────────────────────────────────────

describe('computeAllocationDate', () => {
  it('allocates today when submitted before 3 PM IST on a Monday', () => {
    const t = makeIstTime(2024, 1, 15, 14, 59); // Monday
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-15');
  });

  it('allocates next business day (Tuesday) when submitted at exactly 3:00 PM IST Monday', () => {
    const t = makeIstTime(2024, 1, 15, 15, 0);
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-16');
  });

  it('allocates next business day when submitted at 3:01 PM IST Monday', () => {
    const t = makeIstTime(2024, 1, 15, 15, 1);
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-16');
  });

  it('allocates next business day when submitted at 5:00 PM IST Monday', () => {
    const t = makeIstTime(2024, 1, 15, 17, 0);
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-16');
  });

  // ── Friday edge cases ────────────────────────────────────────────────────

  it('allocates Friday itself when submitted Friday before 3 PM', () => {
    const t = makeIstTime(2024, 1, 19, 9, 0); // Friday
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-19');
  });

  it('skips Sat+Sun: Friday after 3 PM allocates to Monday', () => {
    const t = makeIstTime(2024, 1, 19, 15, 30); // Friday 3:30 PM
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-22'); // Monday
  });

  it('Saturday after 3 PM also allocates to Monday', () => {
    const t = makeIstTime(2024, 1, 20, 15, 30); // Saturday
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-22');
  });

  it('Sunday after 3 PM allocates to Monday', () => {
    const t = makeIstTime(2024, 1, 21, 15, 30); // Sunday
    expect(istDateStr(computeAllocationDate(t))).to.equal('2024-01-22');
  });
});

// ─── calculateAccruedInterestDays — allocationDate path (preferred) ──────────

describe('calculateAccruedInterestDays — with allocationDate', () => {
  // allocationDate uses the midnight-UTC convention from computeAllocationDate.
  function makeAllocDate(isoDate: string): Date {
    return new Date(isoDate + 'T00:00:00.000Z');
  }

  it('returns 0 on the allocationDate itself', () => {
    const allocDate = makeAllocDate('2024-01-15');
    const now = makeIstTime(2024, 1, 15, 9, 0);
    expect(calculateAccruedInterestDays(now, now, allocDate)).to.equal(0);
  });

  it('returns 1 the day after allocationDate', () => {
    const allocDate = makeAllocDate('2024-01-15');
    const now = makeIstTime(2024, 1, 16, 9, 0);
    const createdAt = makeIstTime(2024, 1, 15, 15, 30); // irrelevant when allocDate provided
    expect(calculateAccruedInterestDays(createdAt, now, allocDate)).to.equal(1);
  });

  it('returns 3 three days after allocationDate (including weekend days in raw count)', () => {
    // Friday allocationDate, Monday now → 3 days (Fri→Mon)
    const allocDate = makeAllocDate('2024-01-19'); // Friday
    const now = makeIstTime(2024, 1, 22, 9, 0);  // Monday
    const createdAt = makeIstTime(2024, 1, 19, 9, 0);
    expect(calculateAccruedInterestDays(createdAt, now, allocDate)).to.equal(3);
  });

  it('returns 0 when now is before allocationDate (future allocation)', () => {
    const allocDate = makeAllocDate('2024-01-22'); // Monday (future)
    const now = makeIstTime(2024, 1, 19, 16, 0);  // Friday (before alloc)
    const createdAt = makeIstTime(2024, 1, 19, 16, 0);
    expect(calculateAccruedInterestDays(createdAt, now, allocDate)).to.equal(0);
  });

  it('Friday-after-3PM: allocationDate = Monday, no interest on Friday or weekend', () => {
    // UTR submitted Friday 3:30 PM → allocationDate computed as Monday
    const allocDate = makeAllocDate('2024-01-22'); // Monday
    const fridayEvening = makeIstTime(2024, 1, 19, 16, 0);
    const saturday = makeIstTime(2024, 1, 20, 9, 0);
    const sunday = makeIstTime(2024, 1, 21, 9, 0);
    const monday = makeIstTime(2024, 1, 22, 9, 0);
    const tuesday = makeIstTime(2024, 1, 23, 9, 0);

    // Same-day and weekend: 0 days
    expect(calculateAccruedInterestDays(fridayEvening, fridayEvening, allocDate)).to.equal(0);
    expect(calculateAccruedInterestDays(fridayEvening, saturday, allocDate)).to.equal(0);
    expect(calculateAccruedInterestDays(fridayEvening, sunday, allocDate)).to.equal(0);
    // Monday = allocationDate itself: 0 days
    expect(calculateAccruedInterestDays(fridayEvening, monday, allocDate)).to.equal(0);
    // Tuesday = 1 complete day since Monday allocationDate
    expect(calculateAccruedInterestDays(fridayEvening, tuesday, allocDate)).to.equal(1);
  });

  it('before-3PM investment: allocationDate = today, accrues from day 1', () => {
    // UTR submitted Monday 9 AM → allocationDate = Monday → on Tuesday: 1 day
    const allocDate = makeAllocDate('2024-01-15'); // Monday
    const monday = makeIstTime(2024, 1, 15, 9, 0);
    const tuesday = makeIstTime(2024, 1, 16, 9, 0);
    expect(calculateAccruedInterestDays(monday, tuesday, allocDate)).to.equal(1);
  });
});

// ─── calculateAccruedInterestDays — legacy fallback (no allocationDate) ──────

describe('calculateAccruedInterestDays — legacy fallback (no allocationDate)', () => {
  it('returns 1 when holding created before 3 PM IST yesterday', () => {
    const created = makeIstTime(2024, 1, 14, 9, 0);
    const now = makeIstTime(2024, 1, 15, 9, 0);
    expect(calculateAccruedInterestDays(created, now)).to.equal(1);
  });

  it('returns 0 when holding created before 3 PM IST today', () => {
    const created = makeIstTime(2024, 1, 15, 9, 0);
    const now = makeIstTime(2024, 1, 15, 12, 0);
    expect(calculateAccruedInterestDays(created, now)).to.equal(0);
  });

  it('returns 0 when holding created after 3 PM IST today', () => {
    const created = makeIstTime(2024, 1, 15, 15, 30);
    const now = makeIstTime(2024, 1, 15, 18, 0);
    expect(calculateAccruedInterestDays(created, now)).to.equal(0);
  });

  it('returns 0 when holding created at exactly 3:00 PM IST today', () => {
    const created = makeIstTime(2024, 1, 15, 15, 0);
    const now = makeIstTime(2024, 1, 15, 23, 0);
    expect(calculateAccruedInterestDays(created, now)).to.equal(0);
  });

  it('returns 0 when holding created at 2:59 PM IST today (not yet a full day)', () => {
    const created = makeIstTime(2024, 1, 15, 14, 59);
    const now = makeIstTime(2024, 1, 15, 15, 30);
    expect(calculateAccruedInterestDays(created, now)).to.equal(0);
  });

  it('accrues 5 days for holding created before 3 PM 5 days ago', () => {
    const created = makeIstTime(2024, 1, 10, 10, 0);
    const now = makeIstTime(2024, 1, 15, 12, 0);
    expect(calculateAccruedInterestDays(created, now)).to.equal(5);
  });

  it('never returns negative', () => {
    const created = makeIstTime(2024, 1, 15, 16, 0);
    const now = makeIstTime(2024, 1, 15, 15, 0);
    expect(calculateAccruedInterestDays(created, now)).to.equal(0);
  });

  // ── Weekend-skip fix in legacy fallback ─────────────────────────────────

  it('Friday-after-3PM legacy: effectiveStart skips to Monday, not Saturday', () => {
    const created = makeIstTime(2024, 1, 19, 15, 30); // Friday 3:30 PM
    // On Saturday — should be 0 (effectiveStart = Monday, not yet reached)
    const saturday = makeIstTime(2024, 1, 20, 9, 0);
    expect(calculateAccruedInterestDays(created, saturday)).to.equal(0);

    // On Sunday — still 0
    const sunday = makeIstTime(2024, 1, 21, 9, 0);
    expect(calculateAccruedInterestDays(created, sunday)).to.equal(0);

    // On Monday (effectiveStart = Monday) — 0 days (alloc day itself)
    const monday = makeIstTime(2024, 1, 22, 9, 0);
    expect(calculateAccruedInterestDays(created, monday)).to.equal(0);

    // On Tuesday — 1 day
    const tuesday = makeIstTime(2024, 1, 23, 9, 0);
    expect(calculateAccruedInterestDays(created, tuesday)).to.equal(1);
  });

  it('explicit null allocationDate still uses fallback logic', () => {
    const created = makeIstTime(2024, 1, 14, 9, 0);
    const now = makeIstTime(2024, 1, 15, 9, 0);
    expect(calculateAccruedInterestDays(created, now, null)).to.equal(1);
  });
});

// ─── Withdrawal cutoff isolation ─────────────────────────────────────────────

describe('allocation cutoff is 3 PM IST — independent of 5 PM withdrawal cutoff', () => {
  it('3:00 PM is after allocation cutoff (next-day alloc)', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 15, 0))).to.be.false();
  });

  it('4:59 PM is still after allocation cutoff (not a separate boundary)', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 16, 59))).to.be.false();
  });

  it('5:00 PM is after allocation cutoff (withdrawal boundary does not affect allocation)', () => {
    expect(isBeforeAllocationCutoff(makeIstTime(2024, 1, 15, 17, 0))).to.be.false();
  });
});
