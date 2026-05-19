import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runInvestorHoldingAllocationDateMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  // Effective allocation start date for interest accrual on each PTC holding.
  // Propagated from spv_payment_verifications.allocationdate at allocation time.
  // NULL on legacy holdings — calculateAccruedInterestDays falls back to createdAt logic.
  await datasource.execute(`
    ALTER TABLE public.investor_ptc_holdings
      ADD COLUMN IF NOT EXISTS allocationdate timestamp without time zone
  `);
}
