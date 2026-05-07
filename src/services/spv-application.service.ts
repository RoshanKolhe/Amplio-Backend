/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {PoolFinancials, SpvApplication} from '../models';
import {
  PoolFinancialsRepository,
  SpvApplicationRepository,
  SpvRepository,
  TrusteeProfilesRepository,
} from '../repositories';
import {SpvApplicationStatusService} from './spv-application-status.service';
import {SpvStatusDataService} from './spv-status-data.service';

export class SpvApplicationService {
  private static readonly MIN_POOL_UTILIZATION_TO_CREATE_NEW_POOL = 0;

  constructor(
    @repository(SpvApplicationRepository)
    private spvApplicationRepository: SpvApplicationRepository,
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
    @inject('service.spvApplicationStatus.service')
    private statusService: SpvApplicationStatusService,
    @inject('service.spvStatusData.service')
    private spvStatusDataService: SpvStatusDataService,
  ) {}

  private async fetchApplicationsForLinkedSpv(
    trusteeProfileId: string,
    spvId: string,
  ): Promise<SpvApplication[]> {
    const linkedSpv = await this.spvRepository.findOne({
      where: {
        and: [{id: spvId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!linkedSpv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    const applications = await this.spvApplicationRepository.find({
      where: {
        and: [
          {trusteeProfilesId: trusteeProfileId},
          {isActive: true},
          {isDeleted: false},
          {
            or: [{id: linkedSpv.spvApplicationId}, {linkedSpvId: linkedSpv.id}],
          },
        ],
      },
      order: ['createdAt DESC'],
    });

    if (!applications.length) {
      throw new HttpErrors.NotFound('SPV does not belong to this trustee');
    }

    return applications;
  }

  private async fetchPoolsForApplications(
    applicationIds: string[],
    spvId: string,
  ): Promise<PoolFinancials[]> {
    const pools = await this.poolFinancialsRepository.find({
      where: {
        and: [
          {isActive: true},
          {isDeleted: false},
          {
            or: [{spvApplicationId: {inq: applicationIds}}, {spvId}],
          },
        ],
      },
      order: ['createdAt DESC'],
    });

    const uniquePools = new Map<string, PoolFinancials>();

    for (const pool of pools) {
      uniquePools.set(pool.id, pool);
    }

    return Array.from(uniquePools.values());
  }

  private pickCurrentPool(
    pools: PoolFinancials[],
    approvedApplicationIds: string[],
  ): PoolFinancials | null {
    const sortedPools = [...pools].sort((left, right) => {
      const leftTime = new Date(left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.createdAt ?? 0).getTime();

      return rightTime - leftTime;
    });

    const approvedPool = sortedPools.find(pool =>
      approvedApplicationIds.includes(pool.spvApplicationId),
    );

    return approvedPool ?? sortedPools[0] ?? null;
  }

  private calculatePoolUtilizationPercent(pool: PoolFinancials | null): number {
    const poolLimit = Number(pool?.poolLimit ?? 0);
    const outstanding = Number(pool?.outstanding ?? 0);

    if (poolLimit <= 0) {
      return 0;
    }

    return Number(((outstanding / poolLimit) * 100).toFixed(2));
  }

  async createNewApplication(trusteeProfileId: string): Promise<{
    id: string;
    currentStatus: {
      id: string;
      label: string;
      code: string;
    };
    isActive: boolean;
  }> {
    const trusteeProfile =
      await this.trusteeProfilesRepository.findById(trusteeProfileId);
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

  async createNewPoolApplication(
    trusteeProfileId: string,
    spvId: string,
  ): Promise<{
    id: string;
    currentStatus: {
      id: string;
      label: string;
      code: string;
    };
    isActive: boolean;
    spvId: string;
  }> {
    const trusteeProfile =
      await this.trusteeProfilesRepository.findById(trusteeProfileId);
    const existingApplications = await this.fetchApplicationsForLinkedSpv(
      trusteeProfileId,
      spvId,
    );
    const pendingPoolApplication = existingApplications.find(
      application =>
        application.linkedSpvId === spvId && application.status === 0,
    );

    if (pendingPoolApplication) {
      throw new HttpErrors.BadRequest(
        'A pool application for this SPV is already in progress',
      );
    }

    const approvedApplications = existingApplications.filter(
      application => application.status === 1,
    );

    if (!approvedApplications.length) {
      throw new HttpErrors.BadRequest(
        'The SPV must have an approved pool before creating the next pool',
      );
    }

    const pools = await this.fetchPoolsForApplications(
      existingApplications.map(application => application.id),
      spvId,
    );
    const currentPool = this.pickCurrentPool(
      pools,
      approvedApplications.map(application => application.id),
    );

    if (!currentPool) {
      throw new HttpErrors.BadRequest(
        'Pool financials must be configured before creating the next pool',
      );
    }

    const currentPoolUtilizationPercent =
      this.calculatePoolUtilizationPercent(currentPool);

    if (
      currentPoolUtilizationPercent <
      SpvApplicationService.MIN_POOL_UTILIZATION_TO_CREATE_NEW_POOL
    ) {
      throw new HttpErrors.BadRequest(
        `A new pool can only be created once the current pool utilization reaches ${SpvApplicationService.MIN_POOL_UTILIZATION_TO_CREATE_NEW_POOL}%`,
      );
    }

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
      linkedSpvId: spvId,
    });

    return {
      id: application.id,
      currentStatus: {
        id: status.id,
        label: status.status,
        code: status.value,
      },
      isActive: application.isActive ?? true,
      spvId,
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

  async updateApplicationReviewSubmission(
    applicationId: string,
    payload: Pick<
      SpvApplication,
      'spvApplicationStatusMasterId' | 'reason' | 'verifiedAt'
    >,
    tx?: unknown,
  ): Promise<void> {
    await this.spvApplicationRepository.updateById(
      applicationId,
      payload,
      tx ? {transaction: tx} : undefined,
    );
  }

  async updateApplicationVerification(
    applicationId: string,
    payload: Pick<SpvApplication, 'status' | 'reason' | 'verifiedAt'>,
    tx?: unknown,
  ): Promise<void> {
    await this.spvApplicationRepository.updateById(
      applicationId,
      payload,
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchSingleApplication(
    trusteeProfileId: string,
    applicationId: string,
  ): Promise<{
    id: string;
    reviewStatus: number;
    linkedSpv: string | undefined;
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
      reviewStatus: application.status,
      linkedSpv: application.linkedSpvId,
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
