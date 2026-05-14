import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

/**
 * Phase 1 — Investment Order Foundation
 *
 * Creates four new tables:
 *   investment_orders       — top-level order lifecycle (10 states)
 *   payment_attempts        — each UTR submission per order
 *   ptc_freezes             — explicit per-issuance PTC freeze records (30 min)
 *   escalations             — investor-raised disputes with SLA tracking
 *
 * Additive columns on existing tables:
 *   spv_payment_verifications — orderid, freezeexpiresat, submittedinwindow, allocationdate
 *   spv_pool_financials       — enforcecutoffwindow (default false → safe rollout)
 *
 * Duplicate-UTR enforcement:
 *   Adds a partial unique index on spv_payment_verifications(utrnumber, spvid)
 *   scoped to active statuses only. Existing rows with NULL utrnumber are excluded.
 *
 * All statements use IF NOT EXISTS / DO $$ ... $$ guards so this migration
 * is safe to re-run if it was partially applied.
 */
export async function runInvestmentOrderFoundationMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  // ─────────────────────────────────────────────────────────────
  // TABLE: investment_orders
  // ─────────────────────────────────────────────────────────────
  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.investment_orders (
      id                  uuid PRIMARY KEY,
      investorprofileid   uuid NOT NULL,
      spvid               uuid NOT NULL,
      requestedunits      integer NOT NULL,
      investmentamount    numeric(20,2) NOT NULL,
      facevalueperunit    numeric(20,2),
      status              varchar(40) NOT NULL DEFAULT 'CREATED',
      verificationid      uuid,
      transactionid       uuid,
      agreementsignedat   timestamptz,
      paymentdeadlineat   timestamptz,
      utrsubmittedat      timestamptz,
      freezeexpiresat     timestamptz,
      resolvedat          timestamptz,
      allocatedunits      integer,
      allocatedat         timestamptz,
      partialallocation   boolean NOT NULL DEFAULT false,
      idempotencykey      varchar(128),
      metadata            jsonb,
      cancellationreason  text,
      submittedinwindow   boolean NOT NULL DEFAULT true,
      allocationdate      date,
      createdat           timestamptz NOT NULL DEFAULT now(),
      updatedat           timestamptz NOT NULL DEFAULT now(),
      isactive            boolean NOT NULL DEFAULT true,
      isdeleted           boolean NOT NULL DEFAULT false,
      deletedat           timestamptz,
      createdby           varchar(128),
      updatedby           varchar(128)
    )
  `);

  // Investors may hold multiple concurrent orders for the same SPV — drop any
  // previously created unique constraint that blocked this.
  await datasource.execute(`
    DROP INDEX IF EXISTS public.idx_investment_orders_active_per_investor_spv
  `);

  // Query support for investor's own order list
  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investment_orders_investorprofileid
      ON public.investment_orders(investorprofileid)
      WHERE isdeleted = false
  `);

  // Query support for SPV-scoped order views
  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investment_orders_spvid_status
      ON public.investment_orders(spvid, status)
      WHERE isdeleted = false
  `);

  // PaymentWindowTimeoutCron: find PAYMENT_PENDING orders past their deadline
  // Drop and recreate in case the old index was created with the wrong status filter.
  await datasource.execute(`
    DROP INDEX IF EXISTS public.idx_investment_orders_payment_deadline
  `);
  await datasource.execute(`
    CREATE INDEX idx_investment_orders_payment_deadline
      ON public.investment_orders(paymentdeadlineat)
      WHERE status = 'PAYMENT_PENDING'
        AND isdeleted = false
  `);

  // PTC freeze expiry cron: find UTR_SUBMITTED orders with expired freeze
  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investment_orders_freeze_expires
      ON public.investment_orders(freezeexpiresat)
      WHERE status = 'UTR_SUBMITTED'
        AND isdeleted = false
  `);

  // Idempotency key lookup
  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'investment_orders'
          AND indexname  = 'idx_investment_orders_idempotency_key'
      ) THEN
        CREATE UNIQUE INDEX idx_investment_orders_idempotency_key
          ON public.investment_orders(idempotencykey)
          WHERE idempotencykey IS NOT NULL;
      END IF;
    END $$;
  `);

  // ─────────────────────────────────────────────────────────────
  // TABLE: payment_attempts
  // ─────────────────────────────────────────────────────────────
  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.payment_attempts (
      id                uuid PRIMARY KEY,
      orderid           uuid NOT NULL REFERENCES public.investment_orders(id),
      verificationid    uuid,
      investorprofileid uuid NOT NULL,
      utrnumber         varchar(64) NOT NULL,
      screenshoturl     text,
      amountclaimed     numeric(20,2),
      attemptnumber     integer NOT NULL DEFAULT 1,
      status            varchar(20) NOT NULL DEFAULT 'PENDING',
      submittedat       timestamptz NOT NULL DEFAULT now(),
      reviewedat        timestamptz,
      reviewedby        varchar(128),
      rejectionreason   text,
      createdat         timestamptz NOT NULL DEFAULT now(),
      updatedat         timestamptz NOT NULL DEFAULT now(),
      createdby         varchar(128),
      updatedby         varchar(128)
    )
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_payment_attempts_orderid
      ON public.payment_attempts(orderid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_payment_attempts_utrnumber
      ON public.payment_attempts(utrnumber)
  `);

  // Prevent same investor from having two active UTR submissions simultaneously
  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'payment_attempts'
          AND indexname  = 'idx_payment_attempts_active_utr_investor'
      ) THEN
        CREATE UNIQUE INDEX idx_payment_attempts_active_utr_investor
          ON public.payment_attempts(utrnumber, investorprofileid)
          WHERE status IN ('PENDING', 'REVIEWING');
      END IF;
    END $$;
  `);

  // ─────────────────────────────────────────────────────────────
  // TABLE: ptc_freezes
  // ─────────────────────────────────────────────────────────────
  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.ptc_freezes (
      id                  uuid PRIMARY KEY,
      orderid             uuid NOT NULL REFERENCES public.investment_orders(id),
      verificationid      uuid NOT NULL,
      investorprofileid   uuid NOT NULL,
      spvid               uuid NOT NULL,
      ptcissuanceid       uuid NOT NULL,
      frozenunits         integer NOT NULL,
      freezereason        varchar(30) NOT NULL DEFAULT 'UTR_SUBMITTED',
      status              varchar(20) NOT NULL DEFAULT 'ACTIVE',
      frozenat            timestamptz NOT NULL DEFAULT now(),
      expiresat           timestamptz NOT NULL,
      releasedat          timestamptz,
      releasereason       varchar(20),
      createdat           timestamptz NOT NULL DEFAULT now(),
      updatedat           timestamptz NOT NULL DEFAULT now(),
      createdby           varchar(128),
      updatedby           varchar(128)
    )
  `);

  // Cron lookup: active freezes past expiry
  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_ptc_freezes_expires_active
      ON public.ptc_freezes(expiresat)
      WHERE status = 'ACTIVE'
  `);

  // SPV-scoped freeze view for admin
  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_ptc_freezes_spvid_active
      ON public.ptc_freezes(spvid, status)
      WHERE status = 'ACTIVE'
  `);

  // Lookup by verification
  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_ptc_freezes_verificationid
      ON public.ptc_freezes(verificationid)
  `);

  // Non-negative guard
  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ptc_freezes_frozenunits_nonnegative'
      ) THEN
        ALTER TABLE public.ptc_freezes
          ADD CONSTRAINT ptc_freezes_frozenunits_nonnegative
          CHECK (frozenunits > 0) NOT VALID;
      END IF;
    END $$;
  `);

  // ─────────────────────────────────────────────────────────────
  // TABLE: escalations
  // ─────────────────────────────────────────────────────────────
  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.escalations (
      id                  uuid PRIMARY KEY,
      orderid             uuid,
      verificationid      uuid,
      investorprofileid   uuid NOT NULL,
      spvid               uuid,
      escalationtype      varchar(40) NOT NULL DEFAULT 'PAYMENT_DISPUTE',
      utrnumber           varchar(64),
      reason              varchar(200) NOT NULL,
      description         text NOT NULL,
      attachmenturl       text,
      status              varchar(20) NOT NULL DEFAULT 'OPEN',
      resolution          text,
      resolvedby          varchar(128),
      resolvedat          timestamptz,
      sladeadlineat       timestamptz,
      createdat           timestamptz NOT NULL DEFAULT now(),
      updatedat           timestamptz NOT NULL DEFAULT now(),
      createdby           varchar(128),
      updatedby           varchar(128)
    )
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_escalations_investorprofileid
      ON public.escalations(investorprofileid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_escalations_spvid_status
      ON public.escalations(spvid, status)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_escalations_orderid
      ON public.escalations(orderid)
      WHERE orderid IS NOT NULL
  `);

  // EscalationSlaCron: find OPEN escalations past their SLA deadline
  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_escalations_open_sla
      ON public.escalations(sladeadlineat)
      WHERE status = 'OPEN'
  `);

  // ─────────────────────────────────────────────────────────────
  // ADDITIVE COLUMNS: spv_payment_verifications
  // ─────────────────────────────────────────────────────────────

  // Link back to the investment_orders record (nullable — old records have no order)
  await datasource.execute(`
    ALTER TABLE public.spv_payment_verifications
      ADD COLUMN IF NOT EXISTS orderid uuid
  `);

  // Separate 30-minute PTC freeze window from the existing 10-minute
  // reservation_expires_at (which governs the reservation.metadata).
  // New crons will use freeze_expires_at; old cron continues using reservation_expires_at.
  await datasource.execute(`
    ALTER TABLE public.spv_payment_verifications
      ADD COLUMN IF NOT EXISTS freezeexpiresat timestamptz
  `);

  // Records whether the UTR was submitted within the investment window (9AM–3PM)
  await datasource.execute(`
    ALTER TABLE public.spv_payment_verifications
      ADD COLUMN IF NOT EXISTS submittedinwindow boolean NOT NULL DEFAULT true
  `);

  // Effective date for unit allocation (same day or next business day)
  await datasource.execute(`
    ALTER TABLE public.spv_payment_verifications
      ADD COLUMN IF NOT EXISTS allocationdate date
  `);

  // Hard duplicate-UTR enforcement on spv_payment_verifications.
  // Scoped to active statuses only — historical REJECTED/EXPIRED records are excluded.
  // This turns the current soft-warning into a DB-level constraint.
  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'spv_payment_verifications'
          AND indexname  = 'idx_spv_payment_verifications_utr_spv_active'
      ) THEN
        CREATE UNIQUE INDEX idx_spv_payment_verifications_utr_spv_active
          ON public.spv_payment_verifications(utrnumber, spvid)
          WHERE status IN (
            'SUBMITTED','VERIFIED','AUTO_VERIFIED','ALLOCATED','PAYMENT_UNDER_REVIEW'
          )
          AND utrnumber IS NOT NULL
          AND isdeleted = false;
      END IF;
    END $$;
  `);

  // ─────────────────────────────────────────────────────────────
  // ADDITIVE COLUMNS: spv_pool_financials
  // ─────────────────────────────────────────────────────────────

  // Feature-flag for investment window enforcement.
  // Default FALSE so existing pools are completely unaffected until opted in.
  await datasource.execute(`
    ALTER TABLE public.spv_pool_financials
      ADD COLUMN IF NOT EXISTS enforcecutoffwindow boolean NOT NULL DEFAULT false
  `);

  // Ensure cutoff defaults exist for pools that enable enforcement
  await datasource.execute(`
    UPDATE public.spv_pool_financials
    SET
      morningcutofftime = COALESCE(morningcutofftime, '09:00:00'),
      eveningcutofftime = COALESCE(eveningcutofftime, '15:00:00')
    WHERE morningcutofftime IS NULL
       OR eveningcutofftime IS NULL
  `);

  console.log('[Migration] investment-order-foundation: completed successfully');
}
