/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {BusinessKycProfile} from '../models';
import {
  BusinessKycProfileRepository,
  BusinessKycRepository,
} from '../repositories';

export class BusinessKycProfileDetailsService {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @repository(BusinessKycProfileRepository)
    private businessKycProfileRepository: BusinessKycProfileRepository,
  ) {}

  async createOrUpdateBusinessKycProfileDetails(
    businessKycId: string,
    profileDetails: Partial<Omit<BusinessKycProfile, 'id'>>,
    tx: any,
  ): Promise<{
    profileDetails: BusinessKycProfile;
    updateStatus: boolean;
  }> {
    const existing = await this.businessKycProfileRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });

    const updateStatus = existing.length > 0;

    // delete old
    await this.businessKycRepository
      .businessKycProfile(businessKycId)
      .delete({transaction: tx});

    const created = await this.businessKycRepository
      .businessKycProfile(businessKycId)
      .create(
        {
          ...profileDetails,
          status: 0, // under review
          mode: 1,
          isActive: true,
          isDeleted: false,
        },
        {transaction: tx},
      );
    // });

    return {
      profileDetails: created,
      updateStatus,
    };
  }

  async fetchBusinessKycProfileDetails(
    businessKycId: string,
  ): Promise<BusinessKycProfile[]> {
    return this.businessKycProfileRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });
  }
}
