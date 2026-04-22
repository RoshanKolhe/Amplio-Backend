import {AmplioBackendApplication} from './application';

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
      , 'PoolTransaction'
      , 'PtcParameters'
      , 'TrustDeed'
      , 'EscrowSetup'
      , 'EscrowTransaction'
      , 'IsinApplication'
      , 'SpvKycDocument'
      , 'SpvKycDocumentType'
    ]
  });

  // Connectors usually keep a pool of opened connections,
  // this keeps the process running even after all work is done.
  // We need to exit explicitly.
  process.exit(0);
}

migrate(process.argv).catch(err => {
  console.error('Cannot migrate database schema', err);
  process.exit(1);
});
