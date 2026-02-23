import {inject} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {BusinessKycAuditedFinancialsService} from './business-kyc-audited-financials.service';
import {BusinessKycCollateralAssetsService} from './business-kyc-collateral-assets.service';
import {BusinessKycGuarantorDetailsService} from './business-kyc-guarantor-details.service';
import {BusinessKycProfileDetailsService} from './business-kyc-profile-details.service';
import {BusinessKycFinancialsService} from './business-kyc-financials.service';

export class BusinessKycStatusDataService {
  constructor(
    @inject('service.businessKycProfileDetailsService.service')
    private businessKycProfileDetailsService: BusinessKycProfileDetailsService,
    @inject('service.businessKycGuarantorDetailsService')
    private businessKycGuarantorDetailsService: BusinessKycGuarantorDetailsService,
    @inject('service.businessKycAuditedFinancialsService.service')
    private businessKycAuditedFinancialsService: BusinessKycAuditedFinancialsService,
    @inject('service.businessKycCollateralAssetsService.service')
    private businessKycCollateralAssetsService: BusinessKycCollateralAssetsService,
    @inject('service.businessKycFinancialsService.service')
    private businessKycFinancialsService: BusinessKycFinancialsService
  ) { }

  async fetchDataWithStatus(businessKycId: string, status: string) {
    switch (status) {
      case 'business_profile':
        return this.businessKycProfileDetailsService.fetchBusinessKycProfileDetails(
          businessKycId,
        );
      case 'financial_statements':
      case 'income_tax_returns':
      case 'gstr_9':
      case 'gst_3b':
        return this.businessKycAuditedFinancialsService.fetchAuditedFinancials(
          businessKycId,
        );


      case 'financial_details':
        return this.businessKycFinancialsService.fetchFullFinancialSection(
          businessKycId,
        );
      case 'collateral_assets':
        return this.businessKycCollateralAssetsService.fetchBusinessKycCollateralAssets(
          businessKycId,
        );
      case 'guarantor_details':
        return this.businessKycGuarantorDetailsService.getGuarantorsByBusinessKycId(
          businessKycId,
        );
      default:
        throw new HttpErrors.BadRequest('Invalid status value');
    }
  }
}
