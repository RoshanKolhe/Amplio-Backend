import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';

import {
  BusinessKycAuditedFinancials,
  BusinessKycCollateralAssets,
  BusinessKycGuarantor,
} from '../models';

import {repository} from '@loopback/repository';
import {
  BusinessKycGuarantorRepository,
  BusinessKycGuarantorVerificationRepository,
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';
import {BusinessKycGuarantorDetailsService} from '../services/business-kyc-guarantor-details.service';
import {BusinessKycStateService} from '../services/business-kyc-state.service';
import {BusinessKycStepDataService} from '../services/business-kyc-step-data.service';
import {BusinessKycTransactionsService} from '../services/business-kyc-transaction.service';
import {JWTService} from '../services/jwt-service';

export class BusinessKycController {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,
    @repository(CompanyProfilesRepository)
    private companyProfileRepository: CompanyProfilesRepository,
    @repository(BusinessKycGuarantorVerificationRepository)
    private businessKycGuarantorVerificationRepository: BusinessKycGuarantorVerificationRepository,
    @repository(BusinessKycGuarantorRepository)
    private businessKycGuarantorRepository: BusinessKycGuarantorRepository,
    @inject('service.businessKycGuarantorDetailsService')
    private businessKycGuarantorDetailsService: BusinessKycGuarantorDetailsService,
    @inject('service.businessKycTransactionsService')
    private kycTxnService: BusinessKycTransactionsService,
    @inject('service.jwt.service')
    private jwtService: JWTService,
    @inject('service.businessKycStateService.service')
    private businessKycStateService: BusinessKycStateService,
    @inject('service.businessKycStepDataService')
    private businessKycStepDataService: BusinessKycStepDataService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* START KYC */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc')
  async startBusinessKyc(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
  ) {
    return this.kycTxnService.startBusinessKyc(currentUser.id);
  }

  /* ------------------------------------------------------------------ */
  /* STATE */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/business-kyc/state')
  async fetchBusinessKycState(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
  ) {
    return {
      success: true,
      data: await this.businessKycStateService.fetchStateByUser(currentUser),
    };
  }

  /* ------------------------------------------------------------------ */
  /* FETCH STEP DATA */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/business-kyc/data-by-status/{statusValue}')
  async fetchDataByStatusValue(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
    @param.path.string('statusValue') statusValue: string,
  ) {
    const result = await this.businessKycStepDataService.fetchStepDataByStatus(
      currentUser,
      statusValue,
    );

    return {
      success: true,
      step: result.step,
      data: result.data,
    };
  }

  /* ------------------------------------------------------------------ */
  /* PROFILE DETAILS */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/business-kyc/profile-details')
  async updateProfileDetails(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,

    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['yearInBusiness', 'turnover', 'projectedTurnover'],
            properties: {
              yearInBusiness: {type: 'number'},
              turnover: {type: 'number'},
              projectedTurnover: {type: 'number'},
            },
          },
        },
      },
    })
    body: {
      yearInBusiness: number;
      turnover: number;
      projectedTurnover: number;
    },
  ) {
    return this.kycTxnService.updateProfileDetails(user.id, body);
  }

  /* ------------------------------------------------------------------ */
  /* AUDITED FINANCIALS */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/business-kyc/audited-financials')
  async updateAuditedFinancials(
    @inject(AuthenticationBindings.CURRENT_USER) user: UserProfile,

    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['auditedFinancials'],
            properties: {
              auditedFinancials: {
                type: 'array',
                minItems: 1,
                items: getModelSchemaRef(BusinessKycAuditedFinancials, {
                  exclude: [
                    'id',
                    'status',
                    'mode',
                    'businessKycId',
                    'isActive',
                    'isDeleted',
                    'createdAt',
                    'updatedAt',
                  ],
                }),
              },
            },
          },
        },
      },
    })
    body: {
      auditedFinancials: Omit<BusinessKycAuditedFinancials, 'id'>[];
    },
  ) {
    return this.kycTxnService.updateAuditedFinancials(
      user.id,
      body.auditedFinancials,
    );
  }

  /* ------------------------------------------------------------------ */
  /* GUARANTOR */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc/guarantor-details')
  async addGuarantor(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,

    @requestBody()
    body: Omit<BusinessKycGuarantor, 'id' | 'businessKycId'>,
  ) {
    return this.kycTxnService.addGuarantor(user.id, body);
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc/guarantor-details/continue')
  async continueFromGuarantor(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,
  ) {
    return this.kycTxnService.completeGuarantorStep(user.id);
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/business-kyc/guarantor-details/{guarantorId}')
  async updateGuarantor(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,
    @param.path.string('guarantorId') guarantorId: string,
    @requestBody()
    body: Omit<BusinessKycGuarantor, 'id' | 'businessKycId'>,
  ) {
    return this.kycTxnService.updateGuarantor(user.id, guarantorId, body);
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/business-kyc/guarantor-details')
  async getGuarantorDetails(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
  ) {
    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        usersId: currentUser.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    const kyc = await this.businessKycRepository.findOne({
      where: {
        companyProfilesId: companyProfile.id,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not started');
    }

    const guarantors =
      await this.businessKycGuarantorDetailsService.getGuarantorsByBusinessKycId(
        kyc.id!,
      );

    return {
      success: true,
      data: guarantors,
    };
  }

  @get('/business-kyc/guarantor/verify')
  async verifyGuarantorByLink(
    @param.query.string('token', {required: true}) token: string,
  ) {
    let payload;

    try {
      payload = await this.jwtService.verifyGuarantorVerificationToken(token);
    } catch {
      throw new HttpErrors.Unauthorized('Invalid or expired verification link');
    }

    const {guarantorId, verificationId} = payload;

    const verification =
      await this.businessKycGuarantorVerificationRepository.findById(
        verificationId,
      );

    if (!verification || verification.isDeleted) {
      throw new HttpErrors.NotFound('Verification record not found');
    }

    if (verification.expiresAt && verification.expiresAt < new Date()) {
      throw new HttpErrors.BadRequest('Verification link expired');
    }

    const guarantor =
      await this.businessKycGuarantorRepository.findById(guarantorId);

    if (!guarantor) {
      throw new HttpErrors.NotFound('Guarantor not found');
    }

    if (!verification.isUsed) {
      await this.businessKycGuarantorVerificationRepository.updateById(
        verificationId,
        {
          isVerified: true,
          isUsed: true,
          verifiedAt: new Date(),
        },
      );

      await this.businessKycGuarantorRepository.updateById(guarantorId, {
        status: 2,
      });
    }

    return {
      success: true,
      message: verification.isUsed
        ? 'Guarantor already verified'
        : 'Guarantor verified successfully',
      data: {
        guarantorId: guarantor.id,
        guarantorName: guarantor.guarantorCompanyName,
        cin: guarantor.CIN,
        // documentUrl: guarantor.businessKycGuarantorVerification.mediaId
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* COLLATERAL ASSETS */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/business-kyc/collateral-details')
  async updateCollateralAssets(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,

    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['collateralAssets'],
            properties: {
              collateralAssets: {
                type: 'array',
                minItems: 1,
                items: getModelSchemaRef(BusinessKycCollateralAssets, {
                  exclude: [
                    'id',
                    'status',
                    'mode',
                    'businessKycId',
                    'isActive',
                    'isDeleted',
                    'createdAt',
                    'updatedAt',
                  ],
                }),
              },
            },
          },
        },
      },
    })
    body: {
      collateralAssets: Omit<BusinessKycCollateralAssets, 'id'>[];
    },
  ) {
    return this.kycTxnService.updateCollateralAssets(
      user.id,
      body.collateralAssets,
    );
  }

  /* ------------------------------------------------------------------ */
  /* REVIEW SUBMIT */
  /* ------------------------------------------------------------------ */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc/review-submit')
  async submitReview(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,
  ) {
    return this.kycTxnService.submitReview(user.id);
  }

  /* ------------------------------------------------------------------ */
  /* AGREEMENTS */
  /* --------------------------------------------------- --------------- */

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @patch('/business-kyc/agreements')
  async updateAgreement(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['businessKycDocumentTypeId', 'isAccepted'],
            properties: {
              businessKycDocumentTypeId: {type: 'string'},
              isAccepted: {type: 'boolean'},
            },
          },
        },
      },
    })
    body: {
      businessKycDocumentTypeId: string;
      isAccepted: boolean;
    },
  ) {
    return this.kycTxnService.updateAgreement(
      user.id,
      body.businessKycDocumentTypeId,
      body.isAccepted,
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc/agreements/complete-signing')
  async completeAgreementSigning(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,
  ) {
    return this.kycTxnService.completeAgreementSigning(user.id);
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/business-kyc/agreements')
  async fetchAgreements(
    @inject(AuthenticationBindings.CURRENT_USER)
    user: UserProfile,
  ) {
    const agreements = await this.kycTxnService.fetchAgreements(user.id);

    return {
      success: true,
      data: agreements,
    };
  }
}
