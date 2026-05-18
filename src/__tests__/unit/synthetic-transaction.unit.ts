import {expect} from '@loopback/testlab';
import {SyntheticTransactionService} from '../../services/synthetic-transaction.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearFlags() {
  setEnv({
    ENABLE_SYNTHETIC_TRANSACTIONS: undefined,
    DISABLE_REAL_PSP_SYNC: undefined,
    BYPASS_MERCHANT_VERIFICATION: undefined,
    SYNTHETIC_TRANSACTION_MIN_COUNT: undefined,
    SYNTHETIC_TRANSACTION_MAX_COUNT: undefined,
    SYNTHETIC_DAILY_TARGET_MIN: undefined,
    SYNTHETIC_DAILY_TARGET_MAX: undefined,
  });
}

const SAMPLE_PSP_ID = 'abc12345-0000-0000-0000-000000000001';
const REFERENCE_DATE = new Date('2026-05-18T14:00:00Z');

// ─── feature flag reads ───────────────────────────────────────────────────────

describe('SyntheticTransactionService — feature flags', () => {
  afterEach(clearFlags);

  describe('isSyntheticEnabled()', () => {
    it('returns false when flag is unset', () => {
      expect(SyntheticTransactionService.isSyntheticEnabled()).to.be.false();
    });

    it('returns true for "true"', () => {
      setEnv({ENABLE_SYNTHETIC_TRANSACTIONS: 'true'});
      expect(SyntheticTransactionService.isSyntheticEnabled()).to.be.true();
    });

    it('returns true for "1"', () => {
      setEnv({ENABLE_SYNTHETIC_TRANSACTIONS: '1'});
      expect(SyntheticTransactionService.isSyntheticEnabled()).to.be.true();
    });

    it('returns true for "yes"', () => {
      setEnv({ENABLE_SYNTHETIC_TRANSACTIONS: 'yes'});
      expect(SyntheticTransactionService.isSyntheticEnabled()).to.be.true();
    });

    it('returns true for "on"', () => {
      setEnv({ENABLE_SYNTHETIC_TRANSACTIONS: 'on'});
      expect(SyntheticTransactionService.isSyntheticEnabled()).to.be.true();
    });

    it('returns false for "false"', () => {
      setEnv({ENABLE_SYNTHETIC_TRANSACTIONS: 'false'});
      expect(SyntheticTransactionService.isSyntheticEnabled()).to.be.false();
    });

    it('returns false for "0"', () => {
      setEnv({ENABLE_SYNTHETIC_TRANSACTIONS: '0'});
      expect(SyntheticTransactionService.isSyntheticEnabled()).to.be.false();
    });
  });

  describe('isRealPspSyncDisabled()', () => {
    it('returns false when flag is unset', () => {
      expect(SyntheticTransactionService.isRealPspSyncDisabled()).to.be.false();
    });

    it('returns true for "true"', () => {
      setEnv({DISABLE_REAL_PSP_SYNC: 'true'});
      expect(SyntheticTransactionService.isRealPspSyncDisabled()).to.be.true();
    });

    it('returns false for "false"', () => {
      setEnv({DISABLE_REAL_PSP_SYNC: 'false'});
      expect(SyntheticTransactionService.isRealPspSyncDisabled()).to.be.false();
    });
  });

  describe('isMerchantVerificationBypassed()', () => {
    it('returns false when flag is unset', () => {
      expect(SyntheticTransactionService.isMerchantVerificationBypassed()).to.be.false();
    });

    it('returns true for "1"', () => {
      setEnv({BYPASS_MERCHANT_VERIFICATION: '1'});
      expect(SyntheticTransactionService.isMerchantVerificationBypassed()).to.be.true();
    });
  });
});

// ─── generateForPsp ───────────────────────────────────────────────────────────

describe('SyntheticTransactionService — generateForPsp()', () => {
  afterEach(clearFlags);

  it('returns a non-empty array', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    expect(txns.length).to.be.greaterThan(0);
  });

  it('respects default count range (40–50)', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    expect(txns.length).to.be.greaterThanOrEqual(40);
    expect(txns.length).to.be.lessThanOrEqual(50);
  });

  it('respects custom count range from env', () => {
    setEnv({SYNTHETIC_TRANSACTION_MIN_COUNT: '5', SYNTHETIC_TRANSACTION_MAX_COUNT: '7'});
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    expect(txns.length).to.be.greaterThanOrEqual(5);
    expect(txns.length).to.be.lessThanOrEqual(7);
  });

  it('every tnsId starts with syn_<date>_<pspSlug>_ prefix', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    const slug = SAMPLE_PSP_ID.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
    for (const txn of txns) {
      expect(txn.id).to.match(new RegExp(`^syn_20260518_${slug}_`));
    }
  });

  it('all tnsIds are unique within one batch', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    const ids = txns.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).to.equal(ids.length);
  });

  it('all order_ids are unique within one batch', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    const orderIds = txns.map(t => t.order_id).filter(Boolean);
    const uniqueOrderIds = new Set(orderIds);
    expect(uniqueOrderIds.size).to.equal(orderIds.length);
  });

  it('amounts are in paise (>= 10_000_000 paise = ₹1 lakh each)', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    for (const txn of txns) {
      expect(txn.amount).to.be.greaterThanOrEqual(10_000_000);
    }
  });

  it('currency is INR for all transactions', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    for (const txn of txns) {
      expect(txn.currency).to.equal('INR');
    }
  });

  it('status is one of captured / authorized / failed', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    const validStatuses = new Set(['captured', 'authorized', 'failed']);
    for (const txn of txns) {
      expect(validStatuses.has(txn.status ?? '')).to.be.true();
    }
  });

  it('captured flag matches status', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    for (const txn of txns) {
      if (txn.status === 'captured') {
        expect(txn.captured).to.be.true();
      } else {
        expect(txn.captured).to.be.false();
      }
    }
  });

  it('fee and tax are set only for captured transactions', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    for (const txn of txns) {
      if (txn.status === 'captured') {
        expect(txn.fee).to.not.be.undefined();
        expect(txn.tax).to.not.be.undefined();
      } else {
        expect(txn.fee).to.be.undefined();
        expect(txn.tax).to.be.undefined();
      }
    }
  });

  it('UPI transactions have vpa set', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    for (const txn of txns) {
      if (txn.method === 'upi') {
        expect(txn.vpa).to.not.be.undefined();
      }
    }
  });

  it('non-UPI transactions have no vpa', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    for (const txn of txns) {
      if (txn.method !== 'upi') {
        expect(txn.vpa).to.be.undefined();
      }
    }
  });

  it('created_at values are unix timestamps (> 0)', () => {
    const txns = SyntheticTransactionService.generateForPsp(SAMPLE_PSP_ID, REFERENCE_DATE);
    for (const txn of txns) {
      expect(txn.created_at).to.be.greaterThan(0);
    }
  });

  it('produces a different tnsId prefix for a different pspId', () => {
    const pspA = 'aaa00000-0000-0000-0000-000000000001';
    const pspB = 'bbb00000-0000-0000-0000-000000000002';
    const txnsA = SyntheticTransactionService.generateForPsp(pspA, REFERENCE_DATE);
    const txnsB = SyntheticTransactionService.generateForPsp(pspB, REFERENCE_DATE);
    expect(txnsA[0].id.slice(0, 30)).to.not.equal(txnsB[0].id.slice(0, 30));
  });
});

// ─── hasSyntheticTransactionsForToday ─────────────────────────────────────────

describe('SyntheticTransactionService — hasSyntheticTransactionsForToday()', () => {
  it('returns false when repository finds no matching rows', async () => {
    const mockRepo = {
      find: async () => [],
    } as unknown as import('../../repositories').TransactionRepository;

    const result = await SyntheticTransactionService.hasSyntheticTransactionsForToday(
      SAMPLE_PSP_ID,
      mockRepo,
      REFERENCE_DATE,
    );
    expect(result).to.be.false();
  });

  it('returns true when repository finds at least one matching row', async () => {
    const mockRepo = {
      find: async () => [{id: 'some-uuid'}],
    } as unknown as import('../../repositories').TransactionRepository;

    const result = await SyntheticTransactionService.hasSyntheticTransactionsForToday(
      SAMPLE_PSP_ID,
      mockRepo,
      REFERENCE_DATE,
    );
    expect(result).to.be.true();
  });

  it('queries with correct tnsId prefix for pspId and date', async () => {
    let capturedWhere: unknown;
    const mockRepo = {
      find: async (filter: {where: unknown}) => {
        capturedWhere = filter.where;
        return [];
      },
    } as unknown as import('../../repositories').TransactionRepository;

    await SyntheticTransactionService.hasSyntheticTransactionsForToday(
      SAMPLE_PSP_ID,
      mockRepo,
      REFERENCE_DATE,
    );

    const slug = SAMPLE_PSP_ID.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
    const expectedPrefix = `syn_20260518_${slug}_`;
    const whereStr = JSON.stringify(capturedWhere);
    expect(whereStr).to.containEql(expectedPrefix);
  });
});
