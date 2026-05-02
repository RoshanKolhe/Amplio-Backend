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

async function getTableColumns(
  datasource: AmplioDataSource,
  tableName: string,
): Promise<Set<string>> {
  const rows = await datasource.execute(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName],
  );

  return new Set(
    (rows ?? []).map((row: {columnName?: string}) => row.columnName ?? ''),
  );
}

function selectLegacyColumn(
  existingColumns: Set<string>,
  columnName: string,
  fallbackSql: string,
): string {
  return existingColumns.has(columnName)
    ? `legacy.${columnName}`
    : fallbackSql;
}

function logMissingColumns(
  tableName: string,
  existingColumns: Set<string>,
  expectedColumns: string[],
): void {
  const missingColumns = expectedColumns.filter(
    columnName => !existingColumns.has(columnName),
  );

  if (missingColumns.length > 0) {
    console.log(
      'Legacy table %s is missing columns: %s. Using fallback values for those fields.',
      tableName,
      missingColumns.join(', '),
    );
  }
}

export async function runLegacySpvBackfillMigration(
  app: AmplioBackendApplication,
): Promise<void> {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');
  const legacyPoolTableExists = await tableExists(datasource, 'poolfinancials');
  const legacyPtcTableExists = await tableExists(datasource, 'ptcparameters');

  if (legacyPoolTableExists) {
    const legacyPoolColumns = await getTableColumns(datasource, 'poolfinancials');
    const poolFallbackColumns = [
      'reserveamount',
      'totalfunded',
      'totalsettled',
      'outstanding',
      'dailycutofftime',
      'isactive',
      'isdeleted',
      'createdat',
      'updatedat',
      'deletedat',
      'spvid',
      'escrowsetupid',
    ];

    logMissingColumns('poolfinancials', legacyPoolColumns, poolFallbackColumns);

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
        ${selectLegacyColumn(
          legacyPoolColumns,
          'reserveamount',
          'NULL::double precision',
        )},
        ${selectLegacyColumn(
          legacyPoolColumns,
          'totalfunded',
          '0::double precision',
        )},
        ${selectLegacyColumn(
          legacyPoolColumns,
          'totalsettled',
          '0::double precision',
        )},
        ${selectLegacyColumn(
          legacyPoolColumns,
          'outstanding',
          '0::double precision',
        )},
        ${selectLegacyColumn(
          legacyPoolColumns,
          'dailycutofftime',
          'NULL::text',
        )},
        ${selectLegacyColumn(legacyPoolColumns, 'isactive', 'TRUE')},
        ${selectLegacyColumn(legacyPoolColumns, 'isdeleted', 'FALSE')},
        ${selectLegacyColumn(legacyPoolColumns, 'createdat', 'NOW()')},
        ${selectLegacyColumn(legacyPoolColumns, 'updatedat', 'NOW()')},
        ${selectLegacyColumn(
          legacyPoolColumns,
          'deletedat',
          'NULL::timestamp',
        )},
        legacy.spvapplicationid,
        ${selectLegacyColumn(legacyPoolColumns, 'spvid', 'NULL::uuid')},
        ${selectLegacyColumn(legacyPoolColumns, 'escrowsetupid', 'NULL::uuid')}
      FROM public.poolfinancials legacy
      ON CONFLICT (id) DO NOTHING
    `);

    console.log(
      'Backfilled legacy pool financial rows: %s',
      poolBackfillResult?.rowCount ?? 0,
    );
  }

  if (legacyPtcTableExists) {
    const legacyPtcColumns = await getTableColumns(datasource, 'ptcparameters');
    const ptcFallbackColumns = [
      'maxunitsperinvestor',
      'maxinvestors',
      'windowfrequency',
      'windowdurationhours',
      'isactive',
      'isdeleted',
      'createdat',
      'updatedat',
      'deletedat',
    ];

    logMissingColumns('ptcparameters', legacyPtcColumns, ptcFallbackColumns);

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
        ${selectLegacyColumn(
          legacyPtcColumns,
          'maxunitsperinvestor',
          'NULL::double precision',
        )},
        ${selectLegacyColumn(
          legacyPtcColumns,
          'maxinvestors',
          'NULL::double precision',
        )},
        ${selectLegacyColumn(
          legacyPtcColumns,
          'windowfrequency',
          'NULL::text',
        )},
        ${selectLegacyColumn(
          legacyPtcColumns,
          'windowdurationhours',
          'NULL::double precision',
        )},
        ${selectLegacyColumn(legacyPtcColumns, 'isactive', 'TRUE')},
        ${selectLegacyColumn(legacyPtcColumns, 'isdeleted', 'FALSE')},
        ${selectLegacyColumn(legacyPtcColumns, 'createdat', 'NOW()')},
        ${selectLegacyColumn(legacyPtcColumns, 'updatedat', 'NOW()')},
        ${selectLegacyColumn(
          legacyPtcColumns,
          'deletedat',
          'NULL::timestamp',
        )},
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
