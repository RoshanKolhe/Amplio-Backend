import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runSpvPaymentVerificationMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.spv_payment_verifications (
      id uuid PRIMARY KEY,
      investorprofileid uuid NOT NULL,
      spvid uuid NOT NULL,
      transactionid uuid,
      referenceid varchar(128) NOT NULL,
      utrnumber varchar(64),
      screenshoturl text,
      amount numeric(20,2) NOT NULL,
      verifiedamount numeric(20,2),
      units integer NOT NULL DEFAULT 1,
      allocatedunits integer,
      status varchar(32) NOT NULL DEFAULT 'PENDING',
      verifiedby varchar(128),
      verifiedat timestamptz,
      allocatedat timestamptz,
      rejectionreason text,
      suspiciousreason text,
      idempotencykey varchar(128),
      metadata jsonb,
      createdat timestamptz NOT NULL DEFAULT now(),
      updatedat timestamptz NOT NULL DEFAULT now(),
      isactive boolean NOT NULL DEFAULT true,
      isdeleted boolean NOT NULL DEFAULT false,
      deletedat timestamptz,
      createdby varchar(128),
      updatedby varchar(128)
    )
  `);

  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.redemption_payouts (
      id uuid PRIMARY KEY,
      investorprofileid uuid NOT NULL,
      spvid uuid NOT NULL,
      transactionid varchar(128) NOT NULL,
      redemptionrequestid varchar(128),
      units integer NOT NULL,
      grosspayout numeric(20,2) NOT NULL,
      netpayout numeric(20,2) NOT NULL,
      principalpayout numeric(20,2) NOT NULL,
      interestpayout numeric(20,2) NOT NULL,
      capitalgain numeric(20,2) NOT NULL DEFAULT 0,
      stampdutyamount numeric(20,2) NOT NULL DEFAULT 0,
      stampdutyrate numeric(20,6) NOT NULL DEFAULT 0,
      annualinterestrate numeric NOT NULL DEFAULT 0,
      status varchar(32) NOT NULL DEFAULT 'PENDING',
      processedby varchar(128),
      processedat timestamptz,
      transferreference varchar(256),
      failurereason text,
      metadata jsonb,
      createdat timestamptz NOT NULL DEFAULT now(),
      updatedat timestamptz NOT NULL DEFAULT now(),
      isdeleted boolean NOT NULL DEFAULT false,
      isactive boolean NOT NULL DEFAULT true,
      createdby varchar(128),
      updatedby varchar(128)
    )
  `);

  await datasource.execute(`
    ALTER TABLE public.investor_escrow_ledgers
      ALTER COLUMN investorescrowaccountid DROP NOT NULL
  `);

  await datasource.execute(`
    ALTER TABLE public.spv_payment_verifications
      ADD COLUMN IF NOT EXISTS suspiciousreason text
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_spv_payment_verifications_investorprofileid
    ON public.spv_payment_verifications (investorprofileid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_spv_payment_verifications_spvid_status
    ON public.spv_payment_verifications (spvid, status)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_spv_payment_verifications_transactionid
    ON public.spv_payment_verifications (transactionid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_spv_payment_verifications_utrnumber
    ON public.spv_payment_verifications (utrnumber)
    WHERE utrnumber IS NOT NULL
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_spv_payment_verifications_verifiedat
    ON public.spv_payment_verifications (verifiedat)
    WHERE verifiedat IS NOT NULL
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_redemption_payouts_investorprofileid
    ON public.redemption_payouts (investorprofileid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_redemption_payouts_spvid_status
    ON public.redemption_payouts (spvid, status)
  `);
}
