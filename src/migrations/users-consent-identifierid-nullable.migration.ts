import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

export async function runUsersConsentIdentifierIdNullableMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');

  await datasource.execute(`
    ALTER TABLE public.usersconsent
      ALTER COLUMN identifierid DROP NOT NULL
  `);
}
