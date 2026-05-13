import {AmplioBackendApplication} from './application';
import {runConsentTemplateSlugMigration} from './migrations/consent-template-slug.migration';
import {runEscrowLedgerArchitectureMigration} from './migrations/escrow-ledger-architecture.migration';
import {runFintechIntegrityMigration} from './migrations/fintech-integrity.migration';
import {runLegacySpvBackfillMigration} from './migrations/legacy-spv-backfill.migration';
import {runSpvLegalMetadataMigration} from './migrations/spv-legal-metadata.migration';
import {runUsersConsentIdentifierIdNullableMigration} from './migrations/users-consent-identifierid-nullable.migration';
import {runUsersConsentIsCheckedMigration} from './migrations/users-consent-ischecked.migration';
import {runWalletSchemaMigration} from './migrations/wallet-schema.migration';

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
      'ConsentTemplate',
      'UsersConsent',
      'BankDetails',
      'AuthorizeSignatories',
      'AddressDetails',

      // investor profile models..
      'InvestorProfile',
      'InvestorEscrowAccount',
      'InvestorEscrowLedger',
      'InvestorClosedInvestment',
      'InvestorPtcHolding',
      'WithdrawalRequest',
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
      'PlatformAgreement',
      'SpvApplicationStatusMaster',
      'SpvApplication',
      'SpvApplicationCreditRating',
      'Spv',
      'PoolFinancials',
      'PoolSummary',
      'PoolTransaction',
      'PtcParameters',
      'PtcIssuance',
      'TrustDeed',
      'EscrowSetup',
      'EscrowTransaction',
      'IsinApplication',
      'SpvKycDocument',
      'SpvKycDocumentType',
      'UsersConsent'
    ],
  });

  await runLegacySpvBackfillMigration(app);
  await runConsentTemplateSlugMigration(app);
  await runUsersConsentIsCheckedMigration(app);
  await runUsersConsentIdentifierIdNullableMigration(app);
  await runSpvLegalMetadataMigration(app);
  await runEscrowLedgerArchitectureMigration(app);
  await runWalletSchemaMigration(app);
  await runFintechIntegrityMigration(app);

  // Connectors usually keep a pool of opened connections,
  // this keeps the process running even after all work is done.
  // We need to exit explicitly.
  process.exit(0);
}

migrate(process.argv).catch(err => {
  console.error('Cannot migrate database schema', err);
  process.exit(1);
});

