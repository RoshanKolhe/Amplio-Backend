import {AmplioBackendApplication} from '../application';
import {buildTransactionTokenId} from '../utils/transactions';

type TokenRow = {
  tokenid?: string | null;
};

type TransactionBackfillRow = {
  id: string;
  createdat?: Date | string | null;
  settlementmethod?: string | null;
  companyname?: string | null;
};

export async function runTransactionTokenIdMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const ds = await app.get<{execute: Function}>('datasources.amplio');

  await ds.execute(`
    ALTER TABLE public.transactions
      ADD COLUMN IF NOT EXISTS tokenid VARCHAR(128)
  `);

  const existingTokenRows = (await ds.execute(`
    SELECT tokenid
      FROM public.transactions
     WHERE tokenid IS NOT NULL
  `)) as TokenRow[];

  const usedTokenIds = new Set(
    existingTokenRows
      .map(row => String(row.tokenid ?? '').trim())
      .filter(Boolean),
  );

  let sequence = usedTokenIds.size + 1;

  const transactionsNeedingTokenId = (await ds.execute(`
    SELECT
      t.id,
      t.createdat,
      t.settlementmethod,
      mp.companyname
    FROM public.transactions t
    LEFT JOIN public.psp p
      ON p.id::text = t.pspid::text
    LEFT JOIN public.merchant_profiles mp
      ON mp.id::text = p.merchantprofilesid::text
    WHERE t.tokenid IS NULL
    ORDER BY t.createdat ASC NULLS LAST, t.id ASC
  `)) as TransactionBackfillRow[];

  let backfilledCount = 0;

  for (const transaction of transactionsNeedingTokenId) {
    const createdAt = transaction.createdat
      ? new Date(transaction.createdat)
      : new Date();

    while (true) {
      const tokenId = buildTransactionTokenId({
        year: createdAt.getUTCFullYear(),
        originatorName: transaction.companyname,
        settlementMethod: transaction.settlementmethod ?? undefined,
        sequence,
      });

      if (usedTokenIds.has(tokenId)) {
        sequence += 1;
        continue;
      }

      await ds.execute(
        `
          UPDATE public.transactions
             SET tokenid = $2
           WHERE id = $1::uuid
        `,
        [transaction.id, tokenId],
      );

      usedTokenIds.add(tokenId);
      sequence += 1;
      backfilledCount += 1;
      break;
    }
  }

  await ds.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tokenid_unique
      ON public.transactions (tokenid)
      WHERE tokenid IS NOT NULL
  `);

  console.log(
    '[Migration] transaction-token-id: done (backfilled %s rows)',
    backfilledCount,
  );
}
