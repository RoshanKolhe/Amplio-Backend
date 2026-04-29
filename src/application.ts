import {
  AuthenticationComponent,
  registerAuthenticationStrategy,
} from '@loopback/authentication';
import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import multer from 'multer';
import path from 'path';
import {JWTStrategy} from './authentication-strategy/jwt-strategy';
import {
  EmailManagerBindings,
  FILE_UPLOAD_SERVICE,
  STORAGE_DIRECTORY,
} from './keys';
import {MySequence} from './sequence';
import {AddressDetailsService} from './services/address-details.service';
import {BankDetailsService} from './services/bank-details.service';
import {BusinessKycStatusService} from './services/businees-kyc-status.service';
import {DocumentExtractionService} from './services/document-extraction.service';
import {EmailService} from './services/email.service';
import {BcryptHasher} from './services/hash.password.bcrypt';
import {JWTService} from './services/jwt-service';
import {KycService} from './services/kyc.service';
import {MediaService} from './services/media.service';
import {RbacService} from './services/rbac.service';
import {SessionService} from './services/session.service';
import {AuthorizeSignatoriesService} from './services/signatories.service';
import {UserUploadedDocumentsService} from './services/user-documents.service';
import {MyUserService} from './services/user-service';
import {BusinessKycProfileDetailsService} from './services/business-kyc-profile-details.service';
import {BusinessKycStatusDataService} from './services/business-kyc-status-data.service';
import {BusinessKycAuditedFinancialsService} from './services/business-kyc-audited-financials.service';
import {BusinessKycCollateralAssetsService} from './services/business-kyc-collateral-assets.service';
import {BusinessKycStateService} from './services/business-kyc-state.service';
import {BusinessKycStepDataService} from './services/business-kyc-step-data.service';
import {BusinessKycGuarantorDetailsService} from './services/business-kyc-guarantor-details.service';
import {BusinessKycTransactionsService} from './services/business-kyc-transaction.service';
import {BusinessKycAgreementService} from './services/business-kyc-agreement.service';
import {BusinessKycRocService} from './services/business-kyc-roc.service';
import {BusinessKycDpnService} from './services/business-kyc-dpn.service';
import {BusinessKycFinancialsService} from './services/business-kyc-financials.service';
import {CompanyKycDocumentService} from './services/company-kyc-document.service';
import {CompanyKycDocumentRequirementsService} from './services/company-kyc-document-requirements.service';
import {ComplianceAndDeclarationsService} from './services/compliance-and-declarations.service';
import {InvestorKycDocumentService} from './services/investor-kyc-document.service';
import {InvestorKycDocumentRequirementsService} from './services/investor-kyc-document-requirements.service';
import {InvestorEscrowAccountService} from './services/investor-escrow-account.service';
import {InvestmentMandateService} from './services/investment-mandate.service';
import {InvestorInvestmentsService} from './services/investor-investments.service';
import {MerchantKycDocumentService} from './services/merchant-kyc-document.service';
import {MerchantKycDocumentRequirementsService} from './services/merchant-kyc-document-requirements.service';
import {PlatformAgreementService} from './services/platform-agreement.service';
import {TrusteeKycDocumentRequirementsService} from './services/trustee-kyc-document-requirements.service';
import {UboDetailsService} from './services/ubo-details.service';
import {LiquidityEngineService} from './services/liquidity-engine.service';
import {PspService} from './services/psp.service';
import {PerfiosService} from './services/perfios.service';
import {SpvApplicationService} from './services/spv-application.service';
import {EscrowSetupService} from './services/escrow-setup.service';
import {PoolFinancialsService} from './services/pool-financials.service';
import {PtcParametersService} from './services/ptc-parameters.service';
import {PtcIssuanceService} from './services/ptc-issuance.service';
import {SpvKycDocumentService} from './services/spv-kyc-document.service';
import {SpvApplicationStatusService} from './services/spv-application-status.service';
import {SpvApplicationTransactionsService} from './services/spv-application-transactions.service';
import {SpvApplicationCreditRatingService} from './services/spv-application-credit-rating.service';
import {SpvKycDocumentTypeService} from './services/spv-kyc-document-type.service';
import {SpvService} from './services/spv.service';
import {SpvStatusDataService} from './services/spv-status-data.service';
import {TrustDeedService} from './services/trust-deed.service';
import {IsinApplicationService} from './services/isin-application.service';
import {MerchantPayoutCron} from './crons/merchant-payout.cron';
import {SpvPoolCron} from './crons/spv-pool.cron';
import {TransactionCron} from './crons/transaction.cron';
import {PspRepository} from './repositories/psp.repository';
import {SpvRepository} from './repositories/spv.repository';
import {TransactionRepository} from './repositories/transaction.repository';
import {EscrowService} from './services/escrow.service';
import {UserConsentService} from './services/user-consent.service';
import {CompanyDataMapperService} from './services/company-brisk-data-mapper.service';
import {PoolService} from './services/pool.service';
import {TrusteeKycDocumentService} from './services/trustee-kyc-document.service';
import {MerchantPayoutService} from './services/merchant-payout.service';
import {MerchantPayoutExecutorService} from './services/merchant-payout-executor.service';
import {WalletWithdrawalService} from './services/wallet-withdrawal.service';

export {ApplicationConfig};

export class AmplioBackendApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  private transactionCron?: TransactionCron;
  private merchantPayoutCron?: MerchantPayoutCron;
  private spvPoolCron?: SpvPoolCron;

  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.component(AuthenticationComponent);

    // Set up the custom sequence
    this.sequence(MySequence);
    this.setUpBinding();

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);
    this.configureFileUpload(options.fileStorageDirectory);
    registerAuthenticationStrategy(this, JWTStrategy);

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };
  }

  setUpBinding(): void {
    this.bind('service.hasher').toClass(BcryptHasher);
    this.bind('services.rbac').toClass(RbacService);
    this.bind('jwt.secret').to(process.env.JWT_SECRET!);
    this.bind('jwt.expiresIn').to(process.env.JWT_EXPIRES_IN ?? '7h');
    this.bind('service.jwt.service').toClass(JWTService);
    this.bind('service.user.service').toClass(MyUserService);
    this.bind('service.documentExtraction.service').toClass(
      DocumentExtractionService,
    );
    this.bind('service.AddressDetails.service').toClass(AddressDetailsService);
    this.bind('service.media.service').toClass(MediaService);
    this.bind('service.userUploadedDocuments.service').toClass(
      UserUploadedDocumentsService,
    );
    this.bind('service.bankDetails.service').toClass(BankDetailsService);
    this.bind('services.AuthorizeSignatoriesService.service').toClass(
      AuthorizeSignatoriesService,
    );
    this.bind('service.session.service').toClass(SessionService);
    this.bind('service.kyc.service').toClass(KycService);
    this.bind(EmailManagerBindings.SEND_MAIL).toClass(EmailService);
    this.bind('service.businessKycStatusService.service').toClass(
      BusinessKycStatusService,
    );
    this.bind('service.businessKycProfileDetailsService.service').toClass(
      BusinessKycProfileDetailsService,
    );
    this.bind('service.businessKycStatusDataService.service').toClass(
      BusinessKycStatusDataService,
    );
    this.bind('service.businessKycAuditedFinancialsService.service').toClass(
      BusinessKycAuditedFinancialsService,
    );
    this.bind('service.businessKycCollateralAssetsService.service').toClass(
      BusinessKycCollateralAssetsService,
    );
    this.bind('service.businessKycStateService.service').toClass(
      BusinessKycStateService,
    );
    this.bind('service.businessKycStepDataService').toClass(
      BusinessKycStepDataService,
    );
    this.bind('service.businessKycGuarantorDetailsService').toClass(
      BusinessKycGuarantorDetailsService,
    );
    this.bind('service.businessKycTransactionsService').toClass(
      BusinessKycTransactionsService,
    );
    this.bind('service.businessKycAgreementService.service').toClass(
      BusinessKycAgreementService,
    );
    this.bind('service.businessKycRocService.service').toClass(
      BusinessKycRocService,
    );
    this.bind('service.businessKycDpnService.service').toClass(
      BusinessKycDpnService,
    );
    this.bind('service.businessKycFinancialsService.service').toClass(
      BusinessKycFinancialsService,
    );
    this.bind('service.companyKycDocumentRequirementsService.service').toClass(
      CompanyKycDocumentRequirementsService,
    );
    this.bind('service.investorKycDocumentRequirementsService.service').toClass(
      InvestorKycDocumentRequirementsService,
    );
    this.bind('service.companyKycDocumentService.service').toClass(
      CompanyKycDocumentService,
    );
    this.bind('service.complianceAndDeclarationsService.service').toClass(
      ComplianceAndDeclarationsService,
    );
    this.bind('service.investmentMandateService.service').toClass(
      InvestmentMandateService,
    );
    this.bind('service.investorInvestments.service').toClass(
      InvestorInvestmentsService,
    );
    this.bind('service.investorEscrowAccount.service').toClass(
      InvestorEscrowAccountService,
    );
    this.bind('service.platformAgreementService.service').toClass(
      PlatformAgreementService,
    );
    this.bind('service.investorKycDocumentService.service').toClass(
      InvestorKycDocumentService,
    );
    this.bind('service.merchantKycDocumentRequirementsService.service').toClass(
      MerchantKycDocumentRequirementsService,
    );
    this.bind('service.merchantKycDocumentService.service').toClass(
      MerchantKycDocumentService,
    );
    this.bind('service.trusteeKycDocumentRequirementsService.service').toClass(
      TrusteeKycDocumentRequirementsService,
    );
    this.bind('service.uboDetailsService.service').toClass(
      UboDetailsService,
    );
    this.bind('service.liquidityEngineService.service').toClass(
      LiquidityEngineService,
    );
    this.bind('service.pspService.service').toClass(
      PspService,
    );
    this.bind('service.perfios.service').toClass(PerfiosService);
    this.bind('service.spvApplicationStatus.service').toClass(
      SpvApplicationStatusService,
    );
    this.bind('service.escrowSetup.service').toClass(
      EscrowSetupService,
    );
    this.bind('service.poolFinancials.service').toClass(
      PoolFinancialsService,
    );
    this.bind('service.pool.service').toClass(
      PoolService,
    );
    this.bind('service.spvApplicationCreditRating.service').toClass(
      SpvApplicationCreditRatingService,
    );
    this.bind('service.ptcParameters.service').toClass(
      PtcParametersService,
    );
    this.bind('service.ptcIssuance.service').toClass(
      PtcIssuanceService,
    );
    this.bind('service.trustDeed.service').toClass(
      TrustDeedService,
    );
    this.bind('service.isinApplication.service').toClass(
      IsinApplicationService,
    );
    this.bind('service.escrow.service').toClass(
      EscrowService,
    );
    this.bind('service.spvStatusData.service').toClass(
      SpvStatusDataService,
    );
    this.bind('service.spvApplication.service').toClass(
      SpvApplicationService,
    );
    this.bind('service.spvKycDocument.service').toClass(
      SpvKycDocumentService,
    );
    this.bind('service.spvKycDocumentType.service').toClass(
      SpvKycDocumentTypeService,
    );
    this.bind('service.spvApplicationTransactions.service').toClass(
      SpvApplicationTransactionsService,
    );
    this.bind('service.spv.service').toClass(
      SpvService,
    );
    this.bind('service.userConsentService.service').toClass(
      UserConsentService
    )
    this.bind('service.companyDataMapper.service').toClass(
      CompanyDataMapperService,
    );
    this.bind('service.trusteeKycDocumentService.service').toClass(
      TrusteeKycDocumentService,
    );
    this.bind('service.merchantPayoutService.service').toClass(
      MerchantPayoutService,
    );
    this.bind('service.merchantPayoutExecutorService.service').toClass(
      MerchantPayoutExecutorService,
    );
    this.bind('service.walletWithdrawal.service').toClass(
      WalletWithdrawalService,
    );
  }

  protected configureFileUpload(destination?: string) {
    destination = destination ?? path.join(__dirname, '../.sandbox');
    this.bind(STORAGE_DIRECTORY).to(destination);

    const multerOptions: multer.Options = {
      storage: multer.diskStorage({
        destination,
        filename: (req, file, cb) => {
          const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
          const fileName = `${timestamp}_${file.originalname}`;
          cb(null, fileName);
        },
      }),
    };

    this.configure(FILE_UPLOAD_SERVICE).to(multerOptions);
  }

  async startCrons() {
    if (this.transactionCron && this.merchantPayoutCron && this.spvPoolCron) {
      return;
    }

    if (!this.transactionCron) {
      const transactionRepository = await this.get<TransactionRepository>(
        'repositories.TransactionRepository',
      );
      const pspRepository = await this.get<PspRepository>(
        'repositories.PspRepository',
      );
      const spvRepository = await this.get<SpvRepository>(
        'repositories.SpvRepository',
      );
      const liquidityEngineService = await this.get<LiquidityEngineService>(
        'service.liquidityEngineService.service',
      );
      const pspService = await this.get<PspService>('service.pspService.service');
      const escrowService = await this.get<EscrowService>(
        'service.escrow.service',
      );

      this.transactionCron = new TransactionCron(
        transactionRepository,
        pspRepository,
        spvRepository,
        pspService,
        liquidityEngineService,
        escrowService,
      );
      this.transactionCron.start();
      console.log('[Cron] Transaction cron started');
    }

    if (!this.merchantPayoutCron) {
      const merchantPayoutService = await this.get<MerchantPayoutService>(
        'service.merchantPayoutService.service',
      );
      const merchantPayoutExecutorService =
        await this.get<MerchantPayoutExecutorService>(
          'service.merchantPayoutExecutorService.service',
        );

      this.merchantPayoutCron = new MerchantPayoutCron(
        merchantPayoutService,
        merchantPayoutExecutorService,
      );
      this.merchantPayoutCron.start();
      console.log('[Cron] Merchant payout cron started');
    }

    if (!this.spvPoolCron) {
      const spvRepository = await this.get<SpvRepository>(
        'repositories.SpvRepository',
      );
      const escrowService = await this.get<EscrowService>(
        'service.escrow.service',
      );
      const poolService = await this.get<PoolService>(
        'service.pool.service',
      );

      this.spvPoolCron = new SpvPoolCron(
        spvRepository,
        escrowService,
        poolService,
      );
      this.spvPoolCron.start();
      console.log('[Cron] SPV pool cron started');
    }
  }
}
