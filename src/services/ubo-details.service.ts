/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UboDetails} from '../models';
import {UboDetailsRepository} from '../repositories';
import {MediaService} from './media.service';

export class UboDetailsService {
  constructor(
    @repository(UboDetailsRepository)
    private uboDetailsRepository: UboDetailsRepository,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) { }

  async fetchUboDetails(
    usersId: string,
    identifierId: string,
    roleValue: string,
    filter?: Filter<UboDetails>,
  ): Promise<{
    success: boolean;
    message: string;
    uboDetails: UboDetails[];
  }> {
    const uboDetails = await this.uboDetailsRepository.find({
      where: {
        and: [
          {...filter?.where},
          {usersId},
          {identifierId},
          {roleValue},
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
      message: 'UBO details',
      uboDetails,
    };
  }


  async fetchUbosDetails(usersId: string, roleValue: string, identifierId: string, filter?: Filter<UboDetails>): Promise<{
    success: boolean;
    message: string;
    ubos: UboDetails[]
  }> {
    const ubos = await this.uboDetailsRepository.find({
      where: {
        and: [
          {...filter?.where},
          {usersId: usersId},
          {roleValue: roleValue},
          {identifierId: identifierId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'panCard', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}},
      ],
    });

    return {
      success: true,
      message: 'UBO Details',
      ubos: ubos
    }
  }


  async createUboDetails(
    uboDetails: Omit<UboDetails, 'id'>[],
    tx: any,
  ): Promise<{
    success: boolean;
    message: string;
    createdUboDetails: UboDetails[];
    erroredUboDetails: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }>;
  }> {
    const createdUboDetails: UboDetails[] = [];
    const erroredUboDetails: Array<{
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
            const created = await this.uboDetailsRepository.create(
              uboDetail,
              {transaction: tx},
            );
            createdUboDetails.push(created);
            mediaIds.push(created.panCardId);
            continue;
          } catch (dbErr) {
            if (dbErr?.code === '23505') {
              erroredUboDetails.push({
                fullName: uboDetail.fullName,
                email: uboDetail.email,
                phone: uboDetail.phone,
                submittedPanNumber: uboDetail.submittedPanNumber,
                message: 'This PAN is already added',
              });
              continue;
            }
            throw dbErr;
          }
        }

        erroredUboDetails.push({
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
          const created = await this.uboDetailsRepository.create(
            uboDetail,
            {transaction: tx},
          );
          createdUboDetails.push(created);
          mediaIds.push(created.panCardId);
          continue;
        } catch (dbErr) {
          if (dbErr?.code === '23505') {
            erroredUboDetails.push({
              fullName: uboDetail.fullName,
              email: uboDetail.email,
              phone: uboDetail.phone,
              submittedPanNumber: uboDetail.submittedPanNumber,
              message: 'This PAN is already added',
            });
            continue;
          }
          throw dbErr;
        }
      }

      erroredUboDetails.push({
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
      message: 'UBO details data',
      createdUboDetails,
      erroredUboDetails,
    };
  }

  async updateUboDetail(
    uboId: string,
    uboData: Partial<UboDetails>,
    tx: any,
    owner?: {usersId: string; identifierId?: string; roleValue?: string},
  ): Promise<{
    success: boolean;
    message: string;
    uboDetail: UboDetails | null;
  }> {
    const whereClause: Record<string, unknown>[] = [
      {id: uboId},
      {isActive: true},
      {isDeleted: false},
    ];

    if (owner?.usersId) {
      whereClause.push({usersId: owner.usersId});
    }

    if (owner?.identifierId) {
      whereClause.push({identifierId: owner.identifierId});
    }

    if (owner?.roleValue) {
      whereClause.push({roleValue: owner.roleValue});
    }

    const uboDetail = await this.uboDetailsRepository.findOne(
      {
        where: {
          and: whereClause,
        },
      },
      {transaction: tx},
    );

    if (!uboDetail) {
      throw new HttpErrors.NotFound('UBO detail not found');
    }

    if (uboDetail.status === 1) {
      throw new HttpErrors.BadRequest(
        'UBO detail is already approved! please contact admin',
      );
    }

    await this.uboDetailsRepository.updateById(
      uboId,
      {
        ...uboData,
        status: 0,
        mode: 1,
        identifierId: uboDetail.identifierId,
        usersId: uboDetail.usersId,
        roleValue: uboDetail.roleValue
      },
      {transaction: tx},
    );

    const updatedUboDetail = await this.uboDetailsRepository.findOne(
      {
        where: {
          and: whereClause,
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
      message: 'UBO detail updated',
      uboDetail: updatedUboDetail,
    };
  }



  async updateUBOSStatus(id: string, status: number, reason: string): Promise<{success: boolean; message: string}> {
    const existingUBOS = await this.uboDetailsRepository.findById(id);

    if (!existingUBOS) {
      throw new HttpErrors.NotFound('No UBOS found');
    }

    const statusOptions = [0, 1, 2];

    if (!statusOptions.includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.uboDetailsRepository.updateById(existingUBOS.id, {status: 1, verifiedAt: new Date()});
      return {
        success: true,
        message: 'UBOS Approved'
      }
    }

    if (status === 2) {
      await this.uboDetailsRepository.updateById(existingUBOS.id, {status: 2, reason: reason});
      return {
        success: true,
        message: 'UBOS Rejected'
      }
    }

    if (status === 3) {
      await this.uboDetailsRepository.updateById(existingUBOS.id, {status: 0});
      return {
        success: true,
        message: 'UBOS status is in under review'
      }
    }

    throw new HttpErrors.BadRequest('invalid status');
  }
}
