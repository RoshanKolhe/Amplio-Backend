import {AmplioBackendApplication} from './application';
import {runConsentTemplateSlugMigration} from './migrations/consent-template-slug.migration';
import {runInvestorHoldingAllocationDateMigration} from './migrations/investor-holding-allocation-date.migration';
import {runEscrowLedgerArchitectureMigration} from './migrations/escrow-ledger-architecture.migration';
import {runFintechIntegrityMigration} from './migrations/fintech-integrity.migration';
import {runInvestmentOrderFoundationMigration} from './migrations/investment-order-foundation.migration';
import {runRedemptionPayoutSettlementMigration} from './migrations/redemption-payout-settlement.migration';
import {runLegacySpvBackfillMigration} from './migrations/legacy-spv-backfill.migration';
import {runReservationSchemaMigration} from './migrations/reservation-schema.migration';
import {runSpvLegalMetadataMigration} from './migrations/spv-legal-metadata.migration';
import {runSpvPaymentVerificationMigration} from './migrations/spv-payment-verification.migration';
import {runTransactionSettlementDestinationMigration} from './migrations/transaction-settlement-destination.migration';
import {runTransactionTokenIdMigration} from './migrations/transaction-token-id.migration';
import {runUsersConsentIdentifierIdNullableMigration} from './migrations/users-consent-identifierid-nullable.migration';
import {runUsersConsentIsCheckedMigration} from './migrations/users-consent-ischecked.migration';

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
      'InvestorClosedInvestment',
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
      'UsersConsent',
      'SpvPaymentVerification',
      'InvestmentOrder',
      'PaymentAttempt',
      'PtcFreeze',
      'Escalation',
    ],
  });

  await runLegacySpvBackfillMigration(app);
  await runConsentTemplateSlugMigration(app);
  await runUsersConsentIsCheckedMigration(app);
  await runUsersConsentIdentifierIdNullableMigration(app);
  await runSpvLegalMetadataMigration(app);
  await runEscrowLedgerArchitectureMigration(app);
  await runSpvPaymentVerificationMigration(app);
  await runFintechIntegrityMigration(app);
  await runReservationSchemaMigration(app);
  await runInvestmentOrderFoundationMigration(app);
  await runRedemptionPayoutSettlementMigration(app);
  await runTransactionSettlementDestinationMigration(app);
  await runTransactionTokenIdMigration(app);
  await runInvestorHoldingAllocationDateMigration(app);

  // Connectors usually keep a pool of opened connections,
  // this keeps the process running even after all work is done.
  // We need to exit explicitly.
  process.exit(0);
}

migrate(process.argv).catch(err => {
  console.error('Cannot migrate database schema', err);
  process.exit(1);
});

