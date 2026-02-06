/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
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
  ) { }

  async createOrUpdateBusinessKycProfileDetails(
    businessKycId: string,
    companyProfilesId: string,
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
          companyProfilesId,
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


  async updateBusinessProfileStatus(id: string, status: number, reason: string): Promise<{success: boolean; message: string}> {
    const existingProfile = await this.businessKycProfileRepository.findById(id);

    if (!existingProfile) {
      throw new HttpErrors.NotFound('No profile found');
    }

    const statusOptions = [0, 1, 2];

    if (!statusOptions.includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.businessKycProfileRepository.updateById(existingProfile.id, {status: 1, verifiedAt: new Date()});
      return {
        success: true,
        message: 'Business Profile Approved'
      }
    }

    if (status === 2) {
      await this.businessKycProfileRepository.updateById(existingProfile.id, {status: 2, reason: reason});
      return {
        success: true,
        message: 'Business Profile Rejected'
      }
    }

    if (status === 3) {
      await this.businessKycProfileRepository.updateById(existingProfile.id, {status: 0});
      return {
        success: true,
        message: 'Business Profile status is in under review'
      }
    }

    throw new HttpErrors.BadRequest('invalid status');
  }
}
