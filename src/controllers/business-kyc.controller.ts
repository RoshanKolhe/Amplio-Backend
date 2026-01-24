import {
  authenticate,
  AuthenticationBindings,
} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors, post} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';

export class BusinessKycController {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @repository(CompanyProfilesRepository)
    private companyProfileRepository: CompanyProfilesRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @post('/business-kyc')
  async startBusinessKyc(
    @inject(AuthenticationBindings.CURRENT_USER)
    currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      companyProfileId: string;
      status: string;
      progress: string
    };
  }> {
    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        and: [
          {usersId: currentUser.id},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('No company profile found for this user');
    }

    const companyProfileId = companyProfile.id;

    const kyc = await this.businessKycRepository.create({
      companyProfilesId: companyProfileId,
      status: 'IN_PROGRESS',
      progress: 'start',
      isActive: true,
      isDeleted: false,
    });

    return {
      success: true,
      message: 'Business KYC started successfully',
      data: {
        companyProfileId: kyc.companyProfilesId,
        status: kyc.status ?? 'IN_PROGRESS',
        progress: kyc.progress ?? 'start',
      },
    };
  }
}
