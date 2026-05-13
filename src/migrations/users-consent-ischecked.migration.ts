import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runUsersConsentIsCheckedMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    ALTER TABLE public.usersconsent
      ADD COLUMN IF NOT EXISTS ischecked boolean NOT NULL DEFAULT false
  `);
}
