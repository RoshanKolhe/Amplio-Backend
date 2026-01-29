/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {BusinessKycClientProfile} from '../models';
import {
  BusinessKycClientProfileRepository,
  BusinessKycRepository,
} from '../repositories';

export class BusinessKycClientProfileDetailsService {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @repository(BusinessKycClientProfileRepository)
    private businessKycClientProfileRepository: BusinessKycClientProfileRepository,
  ) { }

  async createOrUpdateBusinessKycClientProfileDetails(
    businessKycId: string,
    clientProfileDetails: Omit<BusinessKycClientProfile, 'id'>[],
    tx: any,
  ): Promise<{
    clientProfileDetails: BusinessKycClientProfile[];
    updateStatus: boolean;
  }> {
    const existing = await this.businessKycClientProfileRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });

    const updateStatus = existing.length === 0;

    // delete old
    await this.businessKycRepository
      .businessKycProfile(businessKycId)
      .delete({transaction: tx});

    // create new (businessKycId auto-attached)
    for (const profile of clientProfileDetails) {
      await this.businessKycRepository
        .businessKycProfile(businessKycId)
        .create(
          {
            ...profile,
            isActive: true,
            isDeleted: false,
          },
          {transaction: tx},
        );
    }

    const created = await this.businessKycClientProfileRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });

    return {
      clientProfileDetails: created,
      updateStatus,
    };
  }

  async fetchBusinessKycProfileDetails(
    businessKycId: string,
  ): Promise<BusinessKycClientProfile[]> {
    return this.businessKycClientProfileRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });
  }
}
