import * as dotenv from 'dotenv';
import {AmplioBackendApplication, ApplicationConfig} from './application';
import {AmplioDataSource} from './datasources';
export * from './application';
dotenv.config();

// Drops any stale unique indexes that were removed from the schema.
// Safe to re-run — all statements are idempotent.
async function dropLegacyIndexes(app: AmplioBackendApplication): Promise<void> {
  try {
    const ds = await app.get<AmplioDataSource>('datasources.amplio');
    // Removed: investors are allowed to hold multiple concurrent orders per SPV
    await ds.execute(`DROP INDEX IF EXISTS public.idx_investment_orders_active_per_investor_spv`);
  } catch (err) {
    // Non-fatal — log and continue
    console.warn('[Startup] Could not drop legacy indexes:', err);
  }
}

export async function main(options: ApplicationConfig = {}) {
  const app = new AmplioBackendApplication(options);
  await app.boot();
  await dropLegacyIndexes(app);
  await app.start();
  await app.startCrons();
  console.log('port', process.env.PORT);
  const url = app.restServer.url;
  console.log(`Server is running at ${url}`);
  console.log(`Try ${url}/ping`);

  return app;
}

if (require.main === module) {
  // Run the application
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3000),
      host: process.env.HOST ?? '127.0.0.1',
      // The `gracePeriodForClose` provides a graceful close for http/https
      // servers with keep-alive clients. The default value is `Infinity`
      // (don't force-close). If you want to immediately destroy all sockets
      // upon stop, set its value to `0`.
      // See https://www.npmjs.com/package/stoppable
      gracePeriodForClose: 5000, // 5 seconds
      openApiSpec: {
        // useful when used with OpenAPI-to-GraphQL to locate your application
        setServersFromRequest: true,
      },
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
