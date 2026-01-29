/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {BusinessKycGuarantor} from '../models';
import {
  BusinessKycGuarantorRepository,
  BusinessKycRepository,
} from '../repositories';

export class BusinessKycGuarantorDetailsService {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @repository(BusinessKycGuarantorRepository)
    private businessKycGuarantorRepository: BusinessKycGuarantorRepository,
  ) { }

  async createOrUpdateBusinessKycGuarantorDetails(
    businessKycId: string,
    GuarantorDetails: Omit<BusinessKycGuarantor, 'id'>[],
    tx: any,
  ): Promise<{
    GuarantorDetails: BusinessKycGuarantor[];
    updateStatus: boolean;
  }> {
    const existing = await this.businessKycGuarantorRepository.find({
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
    for (const profile of GuarantorDetails) {
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

    const created = await this.businessKycGuarantorRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });

    return {
      GuarantorDetails: created,
      updateStatus,
    };
  }

  async fetchBusinessKycGuarantorDetails(
    businessKycId: string,
  ): Promise<BusinessKycGuarantor[]> {
    return this.businessKycGuarantorRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });
  }
}
