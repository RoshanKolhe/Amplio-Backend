import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runWalletSchemaMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.investor_escrow_ledgers (
      id uuid PRIMARY KEY,
      investorescrowaccountid uuid NOT NULL,
      investorid uuid NOT NULL,
      type varchar(255) NOT NULL,
      amount numeric(20,2) NOT NULL,
      balancebefore numeric(20,2) NOT NULL,
      balanceafter numeric(20,2) NOT NULL,
      status varchar(255) NOT NULL DEFAULT 'PENDING',
      transactionid uuid,
      referencetype varchar(255) NOT NULL,
      referenceid varchar(255) NOT NULL,
      remarks varchar(255),
      metadata jsonb,
      createdat timestamptz DEFAULT now(),
      updatedat timestamptz DEFAULT now(),
      isdeleted boolean DEFAULT false,
      createdby varchar(255),
      updatedby varchar(255),
      deletedby varchar(255)
    )
  `);

  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.withdrawal_request (
      id uuid PRIMARY KEY,
      investorprofileid uuid NOT NULL,
      amount numeric(20,2) NOT NULL,
      status varchar(255) NOT NULL DEFAULT 'PENDING',
      requestedat timestamptz DEFAULT now(),
      processedat timestamptz,
      remarks varchar(255),
      createdat timestamptz DEFAULT now(),
      updatedat timestamptz DEFAULT now(),
      isdeleted boolean DEFAULT false
    )
  `);

  await datasource.execute(`
    ALTER TABLE public.investor_escrow_accounts
      ADD COLUMN IF NOT EXISTS currentbalance numeric(20,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS blockedbalance numeric(20,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS currency varchar(10) DEFAULT 'INR',
      ADD COLUMN IF NOT EXISTS providerbankid uuid
  `);

  await datasource.execute(`
    UPDATE public.investor_escrow_accounts
    SET
      currentbalance = COALESCE(currentbalance, 0),
      blockedbalance = COALESCE(blockedbalance, 0),
      currency = COALESCE(NULLIF(currency, ''), 'INR')
    WHERE currentbalance IS NULL
      OR blockedbalance IS NULL
      OR currency IS NULL
      OR currency = ''
  `);

  await datasource.execute(`
    ALTER TABLE public.investor_escrow_accounts
      ALTER COLUMN currentbalance SET DEFAULT 0,
      ALTER COLUMN blockedbalance SET DEFAULT 0,
      ALTER COLUMN currency SET DEFAULT 'INR'
  `);

  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_escrow_accounts_currentbalance_nonnegative'
      ) THEN
        ALTER TABLE public.investor_escrow_accounts
          ADD CONSTRAINT investor_escrow_accounts_currentbalance_nonnegative
          CHECK (currentbalance >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_escrow_accounts_blockedbalance_nonnegative'
      ) THEN
        ALTER TABLE public.investor_escrow_accounts
          ADD CONSTRAINT investor_escrow_accounts_blockedbalance_nonnegative
          CHECK (blockedbalance >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'investor_escrow_accounts_blockedbalance_lte_currentbalance'
      ) THEN
        ALTER TABLE public.investor_escrow_accounts
          ADD CONSTRAINT investor_escrow_accounts_blockedbalance_lte_currentbalance
          CHECK (blockedbalance <= currentbalance) NOT VALID;
      END IF;
    END $$;
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investor_escrow_ledgers_investorid_createdat
    ON public.investor_escrow_ledgers (investorid, createdat DESC)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_withdrawal_request_investorprofileid_status
    ON public.withdrawal_request (investorprofileid, status)
  `);

  await datasource.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_deposit_idempotency
    ON public.investor_escrow_ledgers (investorid, referencetype, referenceid)
    WHERE type = 'DEPOSIT'
      AND referencetype = 'DEPOSIT_IDEMPOTENCY'
      AND isdeleted = false
  `);
}
