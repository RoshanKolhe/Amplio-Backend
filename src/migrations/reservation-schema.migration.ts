import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runReservationSchemaMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  // Unit reservation columns on ptc_issuances
  await datasource.execute(`
    ALTER TABLE public.ptc_issuances
      ADD COLUMN IF NOT EXISTS reservedunits integer NOT NULL DEFAULT 0
  `);

  // Reservation tracking columns on spv_payment_verifications
  await datasource.execute(`
    ALTER TABLE public.spv_payment_verifications
      ADD COLUMN IF NOT EXISTS reservedunits integer,
      ADD COLUMN IF NOT EXISTS unitsreservedat timestamp without time zone,
      ADD COLUMN IF NOT EXISTS reservationexpiresat timestamp without time zone,
      ADD COLUMN IF NOT EXISTS reservationstatus varchar(20)
  `);

  // Add EXPIRED to the status check constraint if it exists
  // We use DO $$ to conditionally update — DROP NOT VALID + recreate is safest
  await datasource.execute(`
    DO $$
    BEGIN
      -- Only add the EXPIRED value check if there is no enum constraint (LoopBack uses varchar)
      -- Index to support expiry queries (SUBMITTED + reservationExpiresAt)
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'spv_payment_verifications'
          AND indexname = 'idx_spv_payment_verifications_reservation_expiry'
      ) THEN
        CREATE INDEX idx_spv_payment_verifications_reservation_expiry
          ON public.spv_payment_verifications (reservationexpiresat)
          WHERE status = 'SUBMITTED'
            AND reservationstatus = 'RESERVED'
            AND isdeleted = false;
      END IF;
    END $$;
  `);

  // Non-negative guard on reservedunits
  await datasource.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ptc_issuances_reservedunits_nonnegative'
      ) THEN
        ALTER TABLE public.ptc_issuances
          ADD CONSTRAINT ptc_issuances_reservedunits_nonnegative
          CHECK (reservedunits >= 0) NOT VALID;
      END IF;
    END $$;
  `);
}
