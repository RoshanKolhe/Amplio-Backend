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
      createdat             timestamptz NOT NULL DEFAULT now(),
      updatedat             timestamptz NOT NULL DEFAULT now(),
      createdby             varchar(128),
      updatedby             varchar(128)
    )
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
}
