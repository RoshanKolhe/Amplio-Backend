import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runEscrowLedgerArchitectureMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    ALTER TABLE public.escrow_transactions
      ADD COLUMN IF NOT EXISTS transactiontype varchar(64),
      ADD COLUMN IF NOT EXISTS direction varchar(32),
      ADD COLUMN IF NOT EXISTS referencemovementid uuid
  `);

  await datasource.execute(`
    ALTER TABLE public.investor_escrow_ledgers
      ADD COLUMN IF NOT EXISTS referencemovementid uuid
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_escrow_transactions_spvid_status_createdat
    ON public.escrow_transactions (spvid, status, createdat DESC)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_escrow_transactions_referencemovementid
    ON public.escrow_transactions (referencemovementid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_investor_escrow_ledgers_referencemovementid
    ON public.investor_escrow_ledgers (referencemovementid)
  `);
}
