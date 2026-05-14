import {AmplioBackendApplication} from '../application';

export async function runRedemptionPayoutSettlementMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const ds = await app.get<{execute: Function}>('datasources.amplio');

  // ── Add settlement scheduling and bank account columns ───────────────────
  await ds.execute(`
    ALTER TABLE public.redemption_payouts
      ADD COLUMN IF NOT EXISTS submitted_at           TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS submitted_after_cutoff BOOLEAN     NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS extra_interest_days    INTEGER     NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS expected_payout_date   DATE,
      ADD COLUMN IF NOT EXISTS settlement_date        DATE,
      ADD COLUMN IF NOT EXISTS bank_account_id        UUID
        REFERENCES public.bank_details(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS bank_account_snapshot  JSONB,
      ADD COLUMN IF NOT EXISTS retry_count            INTEGER     NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_attempt_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS idempotency_key        VARCHAR(256)
  `);

  // ── Migrate existing PENDING records to REQUESTED ────────────────────────
  await ds.execute(`
    UPDATE public.redemption_payouts
       SET status = 'REQUESTED',
           submitted_at = created_at
     WHERE status = 'PENDING'
       AND is_deleted = FALSE
  `);

  // ── Index for cron: find payouts ready to promote ─────────────────────────
  await ds.execute(`
    CREATE INDEX IF NOT EXISTS idx_redemption_payouts_settlement_cron
      ON public.redemption_payouts(expected_payout_date, status)
      WHERE status IN ('REQUESTED', 'PENDING_SETTLEMENT', 'READY_FOR_PAYOUT', 'RETRY_PENDING')
        AND is_deleted = FALSE
  `);

  // ── Idempotency unique index ───────────────────────────────────────────────
  await ds.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_payouts_idempotency_key
      ON public.redemption_payouts(idempotency_key)
      WHERE idempotency_key IS NOT NULL
        AND is_deleted = FALSE
  `);

  console.log('[Migration] redemption-payout-settlement: done');
}
