import {inject} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {CreditRatings, SpvApplicationCreditRating} from '../models';
import {EscrowSetupService} from './escrow-setup.service';
import {PoolFinancialsService} from './pool-financials.service';
import {PtcParametersService} from './ptc-parameters.service';
import {SpvApplicationCreditRatingService} from './spv-application-credit-rating.service';
import {SpvService} from './spv.service';
import {SpvKycDocumentService} from './spv-kyc-document.service';
import {TrustDeedService} from './trust-deed.service';
import {IsinApplicationService} from './isin-application.service';

export class SpvStatusDataService {
  constructor(
    @inject('service.spv.service')
    private spvService: SpvService,
    @inject('service.poolFinancials.service')
    private poolFinancialsService: PoolFinancialsService,
    @inject('service.spvApplicationCreditRating.service')
    private spvApplicationCreditRatingService: SpvApplicationCreditRatingService,
    @inject('service.escrowSetup.service')
    private escrowSetupService: EscrowSetupService,
    @inject('service.ptcParameters.service')
    private ptcParametersService: PtcParametersService,
    @inject('service.trustDeed.service')
    private trustDeedService: TrustDeedService,
    @inject('service.spvKycDocument.service')
    private spvKycDocumentService: SpvKycDocumentService,
    @inject('service.isinApplication.service')
    private isinApplicationService: IsinApplicationService,
  ) {}

  private async getDerivedIsinValues(applicationId: string): Promise<{
    issueSize?: string;
    creditRating?: string;
  }> {
    const [poolFinancials, creditRating] = await Promise.all([
      this.poolFinancialsService.fetchByApplicationId(applicationId),
      this.spvApplicationCreditRatingService.fetchByApplicationId(applicationId),
    ]);

    const creditRatingWithRelations = creditRating as
      | (SpvApplicationCreditRating & {
          creditRatings?: CreditRatings;
        })
      | null;

    return {
      issueSize:
        poolFinancials?.poolLimit !== undefined
          ? String(poolFinancials.poolLimit)
          : undefined,
      creditRating:
        creditRatingWithRelations?.creditRatings?.name ??
        creditRatingWithRelations?.creditRatings?.value,
    };
  }

  async fetchReviewAndSubmitData(applicationId: string) {
    const [
      basicInfo,
      poolFinancials,
      creditRating,
      ptcParameters,
      trustDeed,
      escrow,
      documents,
      isinApplication,
      derivedIsinValues,
    ] = await Promise.all([
      this.spvService.fetchSpvByApplicationId(applicationId),
      this.poolFinancialsService.fetchByApplicationId(applicationId),
      this.spvApplicationCreditRatingService.fetchByApplicationId(applicationId),
      this.ptcParametersService.fetchByApplicationId(applicationId),
      this.trustDeedService.fetchByApplicationId(applicationId),
      this.escrowSetupService.fetchByApplicationId(applicationId),
      this.spvKycDocumentService.fetchDocumentsByApplicationId(applicationId),
      this.isinApplicationService.fetchByApplicationId(applicationId),
      this.getDerivedIsinValues(applicationId),
    ]);

    return {
      basicInfo,
      poolFinancials,
      creditRating,
      ptcParameters,
      trustDeed,
      escrow,
      documents,
      isinApplication: this.isinApplicationService.withDerivedValues(
        isinApplication,
        derivedIsinValues,
      ),
    };
  }

  async fetchDataWithStatus(applicationId: string, status: string) {
    switch (status) {
      case 'spv_basic_info':
        return this.spvService.fetchSpvByApplicationId(applicationId);
      case 'pool_financials':
        return this.poolFinancialsService.fetchByApplicationId(applicationId);
      case 'credit_rating':
        return this.spvApplicationCreditRatingService.fetchByApplicationId(
          applicationId,
        );
      case 'ptc_parameters':
        return this.ptcParametersService.fetchByApplicationId(applicationId);
      case 'trust_deed':
        return this.trustDeedService.fetchByApplicationId(applicationId);
      case 'escrow':
        return this.escrowSetupService.fetchByApplicationId(applicationId);
      case 'documents':
        return this.spvKycDocumentService.fetchDocumentsByApplicationId(
          applicationId,
        );
      case 'isin_application':
        return this.isinApplicationService.withDerivedValues(
          await this.isinApplicationService.fetchByApplicationId(applicationId),
          await this.getDerivedIsinValues(applicationId),
        );
      case 'review_and_submit':
        return this.fetchReviewAndSubmitData(applicationId);
      default:
        throw new HttpErrors.BadRequest('Invalid status value');
    }
  }
}
