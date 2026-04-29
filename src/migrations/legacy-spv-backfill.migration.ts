import {AmplioBackendApplication} from '../application';
import {AmplioDataSource} from '../datasources';

async function tableExists(
  datasource: AmplioDataSource,
  tableName: string,
): Promise<boolean> {
  const rows = await datasource.execute(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS "exists"
    `,
    [tableName],
  );

  return Boolean(rows?.[0]?.exists);
}

export async function runLegacySpvBackfillMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');
  const legacyPoolTableExists = await tableExists(datasource, 'poolfinancials');
  const legacyPtcTableExists = await tableExists(datasource, 'ptcparameters');

  if (legacyPoolTableExists) {
    const poolBackfillResult = await datasource.execute(`
      INSERT INTO public.spv_pool_financials (
        id,
        poollimit,
        maturitydays,
        targetyield,
        reservebufferpercent,
        reserveamount,
        totalfunded,
        totalsettled,
        outstanding,
        dailycutofftime,
        isactive,
        isdeleted,
        createdat,
        updatedat,
        deletedat,
        spvapplicationid,
        spvid,
        escrowsetupid
      )
      SELECT
        legacy.id,
        legacy.poollimit,
        legacy.maturitydays,
        legacy.targetyield,
        legacy.reservebufferpercent,
        legacy.reserveamount,
        legacy.totalfunded,
        legacy.totalsettled,
        legacy.outstanding,
        legacy.dailycutofftime,
        legacy.isactive,
        legacy.isdeleted,
        legacy.createdat,
        legacy.updatedat,
        legacy.deletedat,
        legacy.spvapplicationid,
        legacy.spvid,
        legacy.escrowsetupid
      FROM public.poolfinancials legacy
      ON CONFLICT (id) DO NOTHING
    `);

    console.log(
      'Backfilled legacy pool financial rows: %s',
      poolBackfillResult?.rowCount ?? 0,
    );
  }

  if (legacyPtcTableExists) {
    const ptcBackfillResult = await datasource.execute(`
      INSERT INTO public.spv_ptc_parameters (
        id,
        facevalueperunit,
        mininvestment,
        maxunitsperinvestor,
        maxinvestors,
        windowfrequency,
        windowdurationhours,
        isactive,
        isdeleted,
        createdat,
        updatedat,
        deletedat,
        spvapplicationid
      )
      SELECT
        legacy.id,
        legacy.facevalueperunit,
        legacy.mininvestment,
        legacy.maxunitsperinvestor,
        legacy.maxinvestors,
        legacy.windowfrequency,
        legacy.windowdurationhours,
        legacy.isactive,
        legacy.isdeleted,
        legacy.createdat,
        legacy.updatedat,
        legacy.deletedat,
        legacy.spvapplicationid
      FROM public.ptcparameters legacy
      ON CONFLICT (id) DO NOTHING
    `);

    console.log(
      'Backfilled legacy PTC parameter rows: %s',
      ptcBackfillResult?.rowCount ?? 0,
    );
  }
}
