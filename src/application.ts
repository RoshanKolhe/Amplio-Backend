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

export {ApplicationConfig};

export class AmplioBackendApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
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
      BusinessKycAgreementService
    );
    this.bind('service.businessKycRocService.service').toClass(
      BusinessKycRocService
    );
    this.bind('service.businessKycDpnService.service').toClass(
      BusinessKycDpnService
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
}
