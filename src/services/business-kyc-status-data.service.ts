import {inject} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {BusinessKycProfileDetailsService} from './business-kyc-profile-details.service';


export class BusinessKycStatusDataService {
  constructor(
    @inject('service.businessKycProfileDetailsService.service')
    private businessKycProfileDetailsService: BusinessKycProfileDetailsService
    // @inject('service.BondStatusDocument.service')
    // private bondStatusDocumentService: BondStatusDocumentService,
    // @inject('service.BondApplicationFinancials.service')
    // private bondApplicationFinancials: BondApplicationFinancialsService,
    // @inject('service.BondsDummyIntermediary.service')
    // private bondsDummyIntermediaryService: BondsDummyIntermediaryService,
    // @inject('service.BondAuditedFinancials.service')
    // private bondAuditedFinancialsService: BondAuditedFinancialsService,
    // @inject('service.BondBorrowingDetails.service')
    // private bondBorrowingDetailsService: BondBorrowingDetailsService,
    // @inject('service.BondApplicationCollateralAssets.service')
    // private bondCollateralAssetsService: BondApplicationCollateralAssetsService,
    // @inject('service.BondApplicationCreditRatings.service')
    // private bondCreditRatingsService: BondApplicationCreditRatingsService,
  ) { }

  async fetchDataWithStatus(businessKycId: string, status: string) {
    switch (status) {
      case 'business_profile':
        return this.businessKycProfileDetailsService.fetchBusinessKycProfileDetails(businessKycId);

      // case 'document_upload':
      //   return this.bondStatusDocumentService.fetchDocumentsWithApplicationIdAndStatus(applicationId, 'document_upload');

      // case 'fund_position':
      //   return this.bondApplicationFinancials.fetchFundPositionData(applicationId);

      // case 'capital_details':
      //   return this.bondApplicationFinancials.fetchcapitalDetailsData(applicationId);

      // case 'financial_statements':
      //   return this.bondAuditedFinancialsService.fetchAuditedFinancials(applicationId);

      // case 'income_tax_returns':
      //   return this.bondAuditedFinancialsService.fetchAuditedFinancials(applicationId);

      // case 'gstr-9':
      //   return this.bondAuditedFinancialsService.fetchAuditedFinancials(applicationId);

      // case 'gst-3b':
      //   return this.bondAuditedFinancialsService.fetchAuditedFinancials(applicationId);

      // case 'borrowing_details':
      //   return this.bondBorrowingDetailsService.fetchApplicationBorrowingDetails(applicationId);

      // case 'collateral_assets':
      //   return this.bondCollateralAssetsService.fetchApplicationCollateralAssets(applicationId);

      // case 'financial_details':
      //   return this.bondApplicationFinancials.fetchFinancialRatiosAndProfitabilityDetails(applicationId);

      // case 'credit_rating_approval':
      //   return this.bondCreditRatingsService.fetchApplicationCreditRatings(applicationId);

      // // dummy case later we can delete once done properly...
      // case 'intermediary_appointments_pending':
      //   return this.bondsDummyIntermediaryService.fetchIntermediaries(applicationId);

      // // dummy case later we can delete once done properly...
      // case 'intermediary_appointments_success':
      //   return this.bondsDummyIntermediaryService.fetchIntermediaries(applicationId);


      default:
        throw new HttpErrors.BadRequest('Invalid status value');
    }
  }
}
