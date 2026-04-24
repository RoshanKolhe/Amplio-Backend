import {AmplioBackendApplication} from './application';
import {AmplioDataSource} from './datasources';

async function tableExists(app: AmplioBackendApplication, tableName: string) {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');
  const rows = await datasource.execute(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = $1
      ) as "exists"
    `,
    [tableName],
  );

  return Boolean(rows?.[0]?.exists);
}

async function backfillLegacySpvTables(app: AmplioBackendApplication) {
  const datasource = await app.get<AmplioDataSource>('datasources.amplio');
  const legacyPoolTableExists = await tableExists(app, 'poolfinancials');
  const legacyPtcTableExists = await tableExists(app, 'ptcparameters');

  if (legacyPoolTableExists) {
    const poolBackfillResult = await datasource.execute(`
      insert into public.spv_pool_financials (
        id,
        poollimit,
        maturitydays,
        targetyield,
        
        spvid,
        escrowsetupid
      )
      select
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
      from public.poolfinancials legacy
      on conflict (id) do nothing
    `);

    console.log(
      'Backfilled legacy pool financial rows: %s',
      poolBackfillResult?.rowCount ?? 0,
    );
  }

  if (legacyPtcTableExists) {
    const ptcBackfillResult = await datasource.execute(`
      insert into public.spv_ptc_parameters (
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
      select
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
      from public.ptcparameters legacy
      on conflict (id) do nothing
    `);

    console.log(
      'Backfilled legacy PTC parameter rows: %s',
      ptcBackfillResult?.rowCount ?? 0,
    );
  }
}

export async function migrate(args: string[]) {
  const existingSchema = args.includes('--rebuild') ? 'drop' : 'alter';
  console.log('Migrating schemas (%s existing schema)', existingSchema);

  const app = new AmplioBackendApplication();
  await app.boot();
  await app.migrateSchema({
    existingSchema,
    models: [
      'Users',
      'Roles',
      'Permissions',
      'RolePermissions',
      'UserRoles',
      'Media',
      'Otp',
      'RegistrationSessions',
      'CompanyProfiles',
      'CompanyPanCards',
      'KycApplications',
      'CompanySectorType',
      'CompanyEntityType',
      'CreditRatingAgencies',
      'CreditRatings',
      'TrusteeProfiles',
      'TrusteeEntityTypes',
      'TrusteePanCards',
      'TrusteeKycDocumentRequirements',
      'TrusteeKycDocument',
      'Documents',
      'Screens',
      'DocumentScreens',
      'UserUploadedDocuments',
      'BankDetails',
      'AuthorizeSignatories',
      'AddressDetails',

      // investor profile models..
      'InvestorProfile',
      'InvestorPtcHolding',
      'InvestorPanCards',
      'BusinessKycCollateralAssets',
      'OwnershipTypes',
      'ChargeTypes',
      'CollateralTypes',
      'BusinessKyc',
      'BusinessKycStatusMaster',
      'BusinessKycProfile',
      'BusinessKycAuditedFinancials',
      'BusinessKycGuarantor',
      'BusinessKycGuarantorVerification',
      'BusinessKycAgreement',
      'BusinessKycDocumentType',
      'Roc',
      'BusinessKycDpn',
      'BusinessKycFinancial',
      'CompanyKycDocument',
      'CompanyKycDocumentRequirements',
      'Psp',
      'PspMaster',
      'PspMasterFields',
      'MerchantDealershipType',
      'MerchantProfiles',
      'MerchantPanCard',
      'MerchantPayoutConfig',
      'MerchantPayoutBatch',
      'MerchantPayoutBatchItem',
      'MerchantKycDocumentRequirements',
      'MerchantKycDocument',
      'UboDetails',
      'Transaction',
      'InvestorType',
      'InvestorKycDocumentRequirements',
      'InvestorKycDocument',
      'ComplianceAndDeclarations',
      'InvestmentMandate',
      'PlatformAgreement'
      , 'SpvApplicationStatusMaster'
      , 'SpvApplication'
      , 'SpvApplicationCreditRating'
      , 'Spv'
      , 'PoolFinancials'
      , 'PoolSummary'
      , 'PoolTransaction'
      , 'PtcParameters'
      , 'PtcIssuance'
      , 'TrustDeed'
      , 'EscrowSetup'
      , 'EscrowTransaction'
      , 'IsinApplication'
      , 'SpvKycDocument'
      , 'SpvKycDocumentType'
    ]
  });
  await backfillLegacySpvTables(app);

  // Connectors usually keep a pool of opened connections,
  // this keeps the process running even after all work is done.
  // We need to exit explicitly.
  process.exit(0);
}

migrate(process.argv).catch(err => {
  console.error('Cannot migrate database schema', err);
  process.exit(1);
});
