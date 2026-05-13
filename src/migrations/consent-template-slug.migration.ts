import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runConsentTemplateSlugMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    ALTER TABLE public.consenttemplate
      ADD COLUMN IF NOT EXISTS slug varchar(255),
      ADD COLUMN IF NOT EXISTS roletype varchar(255)
  `);

  await datasource.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_consenttemplate_slug
    ON public.consenttemplate (slug)
    WHERE slug IS NOT NULL
  `);
}
