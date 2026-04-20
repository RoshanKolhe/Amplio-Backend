/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SpvApplication} from '../models';
import {
  SpvApplicationRepository,
  TrusteeProfilesRepository,
} from '../repositories';
import {SpvApplicationStatusService} from './spv-application-status.service';
import {SpvStatusDataService} from './spv-status-data.service';

export class SpvApplicationService {
  constructor(
    @repository(SpvApplicationRepository)
    private spvApplicationRepository: SpvApplicationRepository,
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @inject('service.spvApplicationStatus.service')
    private statusService: SpvApplicationStatusService,
    @inject('service.spvStatusData.service')
    private spvStatusDataService: SpvStatusDataService,
  ) { }

  async createNewApplication(trusteeProfileId: string): Promise<{
    id: string;
    currentStatus: {
      id: string;
      label: string;
      code: string;
    };
    isActive: boolean;
  }> {
    const trusteeProfile = await this.trusteeProfilesRepository.findById(
      trusteeProfileId,
    );
    const status = await this.statusService.fetchInitialStatus();

    const application = await this.spvApplicationRepository.create({
      trusteeProfilesId: trusteeProfile.id,
      usersId: trusteeProfile.usersId,
      isActive: true,
      isDeleted: false,
      status: 0,
      mode: 1,
      humanInteraction: true,
      spvApplicationStatusMasterId: status.id,
    });

    return {
      id: application.id,
      currentStatus: {
        id: status.id,
        label: status.status,
        code: status.value,
      },
      isActive: application.isActive ?? true,
    };
  }

  async fetchApplicationsList(
    trusteeProfileId: string,
    filter?: Filter<SpvApplication>,
  ): Promise<
    {
      id: string;
      currentStatus: {
        id: string;
        label: string;
        code: string;
      };
      reviewStatus: number;
      isActive: boolean;
      createdAt: Date | undefined;
    }[]
  > {
    const applications = await this.spvApplicationRepository.find({
      ...filter,
      where: {
        ...filter?.where,
        and: [
          {trusteeProfilesId: trusteeProfileId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      order: filter?.order ?? ['createdAt desc'],
    });

    const applicationsData = [];

    for (const application of applications) {
      const status = await this.statusService.fetchApplicationStatusById(
        application.spvApplicationStatusMasterId,
      );

      applicationsData.push({
        id: application.id,
        currentStatus: {
          id: status.id,
          label: status.status,
          code: status.value,
        },
        reviewStatus: application.status,
        isActive: application.isActive ?? true,
        createdAt: application.createdAt,
      });
    }

    return applicationsData;
  }

  async verifyApplicationWithTrustee(
    trusteeProfileId: string,
    applicationId: string,
  ) {
    const application = await this.spvApplicationRepository.findOne({
      where: {
        and: [
          {id: applicationId},
          {trusteeProfilesId: trusteeProfileId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!application) {
      throw new HttpErrors.NotFound('SPV application not found');
    }

    return application;
  }

  async verifyApplicationExists(applicationId: string) {
    const application = await this.spvApplicationRepository.findOne({
      where: {
        and: [{id: applicationId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!application) {
      throw new HttpErrors.NotFound('SPV application not found');
    }

    return application;
  }

  async updateApplicationStatus(
    applicationId: string,
    spvApplicationStatusMasterId: string,
    tx?: unknown,
  ): Promise<void> {
    await this.spvApplicationRepository.updateById(
      applicationId,
      {spvApplicationStatusMasterId},
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchSingleApplication(
    trusteeProfileId: string,
    applicationId: string,
  ): Promise<{
    id: string;
    completedSteps: {
      id: string;
      label: string;
      code: string;
    }[];
    activeStep: {
      id: string;
      label: string;
      code: string;
    };
  }> {
    const application = await this.verifyApplicationWithTrustee(
      trusteeProfileId,
      applicationId,
    );

    const currentStatus = await this.statusService.fetchApplicationStatusById(
      application.spvApplicationStatusMasterId,
    );
    let activeStatus = currentStatus;
    let completedSteps: {
      id: string;
      label: string;
      code: string;
    }[] = [];

    if (!currentStatus.isInitial) {
      completedSteps = await this.statusService.fetchCompletedStepsSequence(
        currentStatus.sequenceOrder,
      );
    }

    try {
      if (!currentStatus.isInitial) {
        activeStatus = await this.statusService.fetchNextStatus(
          currentStatus.sequenceOrder,
        );
      }
    } catch (error) {
      activeStatus = currentStatus;
    }

    return {
      id: application.id,
      completedSteps,
      activeStep: {
        id: activeStatus.id,
        label: activeStatus.status,
        code: activeStatus.value,
      },
    };
  }

  async fetchDataByStatusValue(
    trusteeProfileId: string,
    applicationId: string,
    statusValue: string,
  ) {
    const application = await this.verifyApplicationWithTrustee(
      trusteeProfileId,
      applicationId,
    );

    const currentStatus = await this.statusService.fetchApplicationStatusById(
      application.spvApplicationStatusMasterId,
    );

    const status = await this.statusService.verifyStatusValue(statusValue);

    if (
      statusValue !== 'review_and_submit' &&
      status.sequenceOrder > currentStatus.sequenceOrder
    ) {
      throw new HttpErrors.BadRequest('This step is not completed');
    }

    return this.spvStatusDataService.fetchDataWithStatus(
      application.id,
      status.value,
    );
  }
}
