import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runCustomerSupportMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    CREATE TABLE IF NOT EXISTS public.customer_support (
      id                    uuid PRIMARY KEY,
      orderid               uuid NOT NULL REFERENCES public.investment_orders(id),
      investorprofileid     uuid NOT NULL,
      issuetype             varchar(255) NOT NULL,
      complaintdescription  text NOT NULL,
      attachmentmediaid     uuid,
      status                varchar(20) NOT NULL DEFAULT 'OPEN',
      adminresponse         text,
      superadminid          uuid,
      createdat             timestamptz NOT NULL DEFAULT now(),
      updatedat             timestamptz NOT NULL DEFAULT now(),
      createdby             varchar(128),
      updatedby             varchar(128)
    )
  `);

  await datasource.execute(`
    ALTER TABLE public.customer_support
    ADD COLUMN IF NOT EXISTS superadminid uuid
  `);

  await datasource.execute(`
    ALTER TABLE public.customer_support
    ALTER COLUMN superadminid TYPE uuid
    USING NULLIF(superadminid::text, '')::uuid
  `);

  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_customer_support_superadminid'
      ) THEN
        ALTER TABLE public.customer_support
        ADD CONSTRAINT fk_customer_support_superadminid
        FOREIGN KEY (superadminid) REFERENCES public.users(id);
      END IF;
    END $$;
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_customer_support_orderid
      ON public.customer_support(orderid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_customer_support_investorprofileid
      ON public.customer_support(investorprofileid)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_customer_support_status
      ON public.customer_support(status)
  `);

  await datasource.execute(`
    CREATE INDEX IF NOT EXISTS idx_customer_support_superadminid
      ON public.customer_support(superadminid)
  `);
}
