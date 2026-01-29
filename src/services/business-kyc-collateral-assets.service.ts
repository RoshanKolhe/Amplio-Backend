/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {BusinessKycCollateralAssets} from '../models';
import {
  BusinessKycCollateralAssetsRepository,
  BusinessKycRepository,
} from '../repositories';

export class BusinessKycCollateralAssetsService {
  constructor(
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,
    @repository(BusinessKycCollateralAssetsRepository)
    private collateralAssetsRepository: BusinessKycCollateralAssetsRepository,
  ) { }

  // create or update collateral assets...
  async createOrUpdateCollateralAssets(
    businessKycId: string,
    borrowingDetails: Omit<BusinessKycCollateralAssets, 'id'>[],
    tx: any,
  ): Promise<{
    collateralAssets: BusinessKycCollateralAssets[];
    updateStatus: boolean;
  }> {
    const existingCollateralAssets = await this.collateralAssetsRepository.find(
      {
        where: {
          businessKycId,
          isActive: true,
          isDeleted: false,
        },
      },
    );

    let updateStatus = true;

    if (existingCollateralAssets.length > 0) {
      updateStatus = false;
    }

    await this.businessKycRepository
      .businessKycCollateralAssets(businessKycId)
      .delete({isActive: true, isDeleted: false}, {transaction: tx});

    for (const borrowing of borrowingDetails) {
      await this.businessKycRepository
        .businessKycCollateralAssets(businessKycId)
        .create(
          {
            ...borrowing,
            isActive: true,
            isDeleted: false,
          },
          {transaction: tx},
        );
    }

    const createdCollateralAssets = await this.collateralAssetsRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });

    return {
      collateralAssets: createdCollateralAssets,
      updateStatus,
    };
  }

  // fetch collateral assets with application id...
  async fetchBusinessKycCollateralAssets(
    businessKycId: string,
  ): Promise<BusinessKycCollateralAssets[]> {
    const collateralAssets = await this.collateralAssetsRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
    });

    return collateralAssets;
  }

  // Approve collateral assets....
  async approveCollateralAssets(
    businessKycId: string,
    data: Partial<BusinessKycCollateralAssets>,
  ): Promise<{
    success: boolean;
    message: string;
    isUpdated: boolean;
  }> {
    const collateralAssets = await this.collateralAssetsRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
      fields: {id: true},
    });

    if (!collateralAssets || collateralAssets.length === 0) {
      throw new HttpErrors.NotFound('No collateral assets found');
    }

    const collateralAssetsIds = collateralAssets.map(asset => asset.id);

    await this.collateralAssetsRepository.updateAll(data, {
      id: {inq: collateralAssetsIds},
    });

    return {
      success: true,
      message: 'Collateral assets approved',
      isUpdated: true,
    };
  }
}
