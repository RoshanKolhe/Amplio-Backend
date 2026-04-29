import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runFintechIntegrityMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ptc_issuances_totalunits_nonnegative'
      ) THEN
        ALTER TABLE public.ptc_issuances
          ADD CONSTRAINT ptc_issuances_totalunits_nonnegative
          CHECK (totalunits >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ptc_issuances_soldunits_nonnegative'
      ) THEN
        ALTER TABLE public.ptc_issuances
          ADD CONSTRAINT ptc_issuances_soldunits_nonnegative
          CHECK (soldunits >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ptc_issuances_remainingunits_nonnegative'
      ) THEN
        ALTER TABLE public.ptc_issuances
          ADD CONSTRAINT ptc_issuances_remainingunits_nonnegative
          CHECK (remainingunits >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ptc_issuances_units_balance'
      ) THEN
        ALTER TABLE public.ptc_issuances
          ADD CONSTRAINT ptc_issuances_units_balance
          CHECK ((soldunits + remainingunits) = totalunits) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_ptc_holdings_ownedunits_nonnegative'
      ) THEN
        ALTER TABLE public.investor_ptc_holdings
          ADD CONSTRAINT investor_ptc_holdings_ownedunits_nonnegative
          CHECK (ownedunits >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_ptc_holdings_investedamount_nonnegative'
      ) THEN
        ALTER TABLE public.investor_ptc_holdings
          ADD CONSTRAINT investor_ptc_holdings_investedamount_nonnegative
          CHECK (investedamount >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_closed_investments_totalunits_nonnegative'
      ) THEN
        ALTER TABLE public.investor_closed_investments
          ADD CONSTRAINT investor_closed_investments_totalunits_nonnegative
          CHECK (totalunits >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_closed_investments_totalinvestedamount_nonnegative'
      ) THEN
        ALTER TABLE public.investor_closed_investments
          ADD CONSTRAINT investor_closed_investments_totalinvestedamount_nonnegative
          CHECK (totalinvestedamount >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_closed_investments_totalredeemedamount_nonnegative'
      ) THEN
        ALTER TABLE public.investor_closed_investments
          ADD CONSTRAINT investor_closed_investments_totalredeemedamount_nonnegative
          CHECK (totalredeemedamount >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_closed_investments_netpayout_nonnegative'
      ) THEN
        ALTER TABLE public.investor_closed_investments
          ADD CONSTRAINT investor_closed_investments_netpayout_nonnegative
          CHECK (netpayout >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_closed_investments_interestpayout_nonnegative'
      ) THEN
        ALTER TABLE public.investor_closed_investments
          ADD CONSTRAINT investor_closed_investments_interestpayout_nonnegative
          CHECK (interestpayout >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_closed_investments_stampdutyamount_nonnegative'
      ) THEN
        ALTER TABLE public.investor_closed_investments
          ADD CONSTRAINT investor_closed_investments_stampdutyamount_nonnegative
          CHECK (stampdutyamount >= 0) NOT VALID;
      END IF;
    END $$;
  `);

  await datasource.execute(`
    DO $$
    DECLARE
      index_record record;
    BEGIN
      FOR index_record IN
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'investor_ptc_holdings'
          AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
          AND indexdef ILIKE '%investorprofileid%'
          AND indexdef ILIKE '%ptcissuanceid%'
          AND indexdef NOT ILIKE '%WHERE%'
      LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', index_record.indexname);
      END LOOP;
    END $$;
  `);

  await datasource.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_ptc_holding_active
    ON public.investor_ptc_holdings (investorprofileid, ptcissuanceid)
    WHERE isdeleted = false
  `);

  await datasource.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_ptc_buy_idempotency
    ON public.investor_escrow_ledgers (investorid, referencetype, referenceid)
    WHERE type = 'BUY_DEBIT'
      AND referencetype = 'PTC_BUY_IDEMPOTENCY'
      AND isdeleted = false
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investor_closed_investments_investorprofileid
    ON public.investor_closed_investments (investorprofileid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investor_closed_investments_spvid
    ON public.investor_closed_investments (spvid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investor_closed_investments_closedat
    ON public.investor_closed_investments (closedat)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investor_closed_investments_isdeleted
    ON public.investor_closed_investments (isdeleted)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investor_closed_investments_investor_spv_closedat
    ON public.investor_closed_investments (investorprofileid, spvid, closedat DESC)
  `);

  await datasource.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_closed_investments_redemptionrequestid
    ON public.investor_closed_investments (redemptionrequestid)
    WHERE redemptionrequestid IS NOT NULL
      AND isdeleted = false
  `);

  await datasource.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_closed_investments_transactionid
    ON public.investor_closed_investments (transactionid)
    WHERE transactionid IS NOT NULL
      AND isdeleted = false
  `);
}
