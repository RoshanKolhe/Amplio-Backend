import {AmplioBackendApplication} from '../application';

export async function runRedemptionPayoutSettlementMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const ds = await app.get<{execute: Function}>('datasources.amplio');

  // ── Add settlement scheduling and bank account columns ───────────────────
  await ds.execute(`
    ALTER TABLE public.redemption_payouts
      ADD COLUMN IF NOT EXISTS submittedat           TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS submittedaftercutoff BOOLEAN     NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS extrainterestdays    INTEGER     NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS expectedpayoutdate   DATE,
      ADD COLUMN IF NOT EXISTS settlementdate        DATE,
      ADD COLUMN IF NOT EXISTS bankaccountid        UUID
        REFERENCES public.bank_details(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS bankaccountsnapshot  JSONB,
      ADD COLUMN IF NOT EXISTS retrycount            INTEGER     NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS lastattemptat        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS idempotencykey        VARCHAR(256)
  `);

  // ── Migrate existing PENDING records to REQUESTED ────────────────────────
  await ds.execute(`
    UPDATE public.redemption_payouts
       SET status = 'REQUESTED',
           submittedat = createdat
     WHERE status = 'PENDING'
       AND isdeleted = FALSE
  `);

  // ── Index for cron: find payouts ready to promote ─────────────────────────
  await ds.execute(`
    DROP INDEX IF EXISTS public.idx_redemption_payouts_settlement_cron;
    CREATE INDEX IF NOT EXISTS idx_redemption_payouts_settlement_cron
      ON public.redemption_payouts(expectedpayoutdate, status)
      WHERE status IN ('REQUESTED', 'PENDING_SETTLEMENT', 'READY_FOR_PAYOUT', 'RETRY_PENDING')
        AND isdeleted = FALSE
  `);

  // ── Idempotency unique index ───────────────────────────────────────────────
  await ds.execute(`
    DROP INDEX IF EXISTS public.idx_redemption_payouts_idempotency_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_payouts_idempotency_key
      ON public.redemption_payouts(idempotencykey)
      WHERE idempotencykey IS NOT NULL
        AND isdeleted = FALSE
  `);

  console.log('[Migration] redemption-payout-settlement: done');
}
