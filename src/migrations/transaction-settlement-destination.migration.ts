import {AmplioBackendApplication} from '../application';

export async function runTransactionSettlementDestinationMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const ds = await app.get<{execute: Function}>('datasources.amplio');

  await ds.execute(`
    ALTER TABLE public.transactions
      ADD COLUMN IF NOT EXISTS settlementdestination VARCHAR(32)
  `);

  await ds.execute(`
    UPDATE public.transactions
       SET settlementdestination = CASE
         WHEN spvid IS NOT NULL THEN 'spv'
         ELSE 'platform'
       END
     WHERE settlementdestination IS NULL
  `);

  await ds.execute(`
    ALTER TABLE public.transactions
      ALTER COLUMN settlementdestination SET DEFAULT 'platform'
  `);

  await ds.execute(`
    CREATE INDEX IF NOT EXISTS idx_transactions_settlementdestination
      ON public.transactions (settlementdestination)
      WHERE isdeleted = FALSE
  `);

  console.log('[Migration] transaction-settlement-destination: done');
}
