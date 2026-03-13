/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {MerchantUboDetails} from '../models';
import {MerchantUboDetailsRepository} from '../repositories';
import {MediaService} from './media.service';

export class MerchantUboDetailsService {
  constructor(
    @repository(MerchantUboDetailsRepository)
    private merchantUboDetailsRepository: MerchantUboDetailsRepository,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) { }

  async fetchMerchantUboDetails(
    usersId: string,
    identifierId: string,
    filter?: Filter<MerchantUboDetails>,
  ): Promise<{
    success: boolean;
    message: string;
    uboDetails: MerchantUboDetails[];
  }> {
    const uboDetails = await this.merchantUboDetailsRepository.find({
      where: {
        and: [
          {...filter?.where},
          {usersId},
          {identifierId},
          {roleValue: 'merchant'},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      include: [
        {
          relation: 'panCard',
          scope: {
            fields: {id: true, fileUrl: true, fileOriginalName: true},
          },
        },
      ],
    });

    return {
      success: true,
      message: 'Merchant UBO details',
      uboDetails,
    };
  }

  async createMerchantUboDetails(
    uboDetails: Omit<MerchantUboDetails, 'id'>[],
    tx: any,
  ): Promise<{
    success: boolean;
    message: string;
    createdMerchantUboDetails: MerchantUboDetails[];
    erroredMerchantUboDetails: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }>;
  }> {
    const createdMerchantUboDetails: MerchantUboDetails[] = [];
    const erroredMerchantUboDetails: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }> = [];
    const mediaIds: string[] = [];

    for (const uboDetail of uboDetails) {
      const extractedName = uboDetail.extractedPanFullName?.trim().toLowerCase();
      const submittedPanName = uboDetail.submittedPanFullName
        ?.trim()
        .toLowerCase();
      const fullName = uboDetail.fullName.trim().toLowerCase();

      const nameMatches =
        extractedName?.includes(fullName) ?? submittedPanName?.includes(fullName);

      if (
        uboDetail.extractedPanNumber &&
        uboDetail.extractedPanFullName &&
        uboDetail.extractedDateOfBirth
      ) {
        if (
          uboDetail.extractedPanNumber === uboDetail.submittedPanNumber &&
          nameMatches
        ) {
          uboDetail.mode = 0;
          uboDetail.status = 1;
          uboDetail.verifiedAt = new Date();

          try {
            const created = await this.merchantUboDetailsRepository.create(
              uboDetail,
              {transaction: tx},
            );
            createdMerchantUboDetails.push(created);
            mediaIds.push(created.panCardId);
            continue;
          } catch (dbErr) {
            if (dbErr?.code === '23505') {
              erroredMerchantUboDetails.push({
                fullName: uboDetail.fullName,
                email: uboDetail.email,
                phone: uboDetail.phone,
                submittedPanNumber: uboDetail.submittedPanNumber,
                message: 'This PAN is already added for this merchant',
              });
              continue;
            }
            throw dbErr;
          }
        }

        erroredMerchantUboDetails.push({
          fullName: uboDetail.fullName,
          email: uboDetail.email,
          phone: uboDetail.phone,
          submittedPanNumber: uboDetail.submittedPanNumber,
          message: 'Fullname does not match with given pan',
        });
        continue;
      }

      if (submittedPanName?.includes(fullName)) {
        uboDetail.mode = 1;
        uboDetail.status = 0;

        try {
          const created = await this.merchantUboDetailsRepository.create(
            uboDetail,
            {transaction: tx},
          );
          createdMerchantUboDetails.push(created);
          mediaIds.push(created.panCardId);
          continue;
        } catch (dbErr) {
          if (dbErr?.code === '23505') {
            erroredMerchantUboDetails.push({
              fullName: uboDetail.fullName,
              email: uboDetail.email,
              phone: uboDetail.phone,
              submittedPanNumber: uboDetail.submittedPanNumber,
              message: 'This PAN is already added for this merchant',
            });
            continue;
          }
          throw dbErr;
        }
      }

      erroredMerchantUboDetails.push({
        fullName: uboDetail.fullName,
        email: uboDetail.email,
        phone: uboDetail.phone,
        submittedPanNumber: uboDetail.submittedPanNumber,
        message: 'Fullname does not match with pan card',
      });
    }

    if (mediaIds.length) {
      await this.mediaService.updateMediaUsedStatus(mediaIds, true);
    }

    return {
      success: true,
      message: 'Merchant UBO details data',
      createdMerchantUboDetails,
      erroredMerchantUboDetails,
    };
  }

  async updateMerchantUboDetail(
    uboId: string,
    uboData: Partial<MerchantUboDetails>,
    tx: any,
  ): Promise<{
    success: boolean;
    message: string;
    uboDetail: MerchantUboDetails | null;
  }> {
    const uboDetail = await this.merchantUboDetailsRepository.findOne(
      {
        where: {
          and: [{id: uboId}, {isActive: true}, {isDeleted: false}],
        },
      },
      {transaction: tx},
    );

    if (!uboDetail) {
      throw new HttpErrors.NotFound('Merchant UBO detail not found');
    }

    if (uboDetail.status === 1) {
      throw new HttpErrors.BadRequest(
        'Merchant UBO detail is already approved! please contact admin',
      );
    }

    await this.merchantUboDetailsRepository.updateById(
      uboId,
      {
        ...uboData,
        status: 0,
        mode: 1,
        identifierId: uboDetail.identifierId,
        usersId: uboDetail.usersId,
        roleValue: 'merchant'
      },
      {transaction: tx},
    );

    const updatedUboDetail = await this.merchantUboDetailsRepository.findOne(
      {
        where: {
          and: [{id: uboId}, {isActive: true}, {isDeleted: false}],
        },
        include: [
          {
            relation: 'panCard',
            scope: {
              fields: {id: true, fileUrl: true, fileOriginalName: true},
            },
          },
        ],
      },
      {transaction: tx},
    );

    if (updatedUboDetail && updatedUboDetail.panCardId !== uboDetail.panCardId) {
      await this.mediaService.updateMediaUsedStatus([uboDetail.panCardId], false);
      await this.mediaService.updateMediaUsedStatus(
        [updatedUboDetail.panCardId],
        true,
      );
    }

    return {
      success: true,
      message: 'Merchant UBO detail updated',
      uboDetail: updatedUboDetail,
    };
  }
}
