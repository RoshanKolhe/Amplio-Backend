import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runSpvLegalMetadataMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    ALTER TABLE public.spv
      ADD COLUMN IF NOT EXISTS registrationnumber varchar(255),
      ADD COLUMN IF NOT EXISTS incorporationdate timestamptz
  `);

  await datasource.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_spv_registrationnumber
    ON public.spv (registrationnumber)
    WHERE registrationnumber IS NOT NULL
  `);
}
