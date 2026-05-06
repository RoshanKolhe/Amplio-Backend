import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SpvApplicationStatusMaster} from '../models';
import {SpvApplicationStatusMasterRepository} from '../repositories';

export class SpvApplicationStatusService {
  constructor(
    @repository(SpvApplicationStatusMasterRepository)
    private spvApplicationStatusMasterRepository: SpvApplicationStatusMasterRepository,
  ) {}

  private isVisibleFlowStatus(status: SpvApplicationStatusMaster) {
    // Documents are now handled inside the trust deed step in the SPV UI.
    // Keep the DB row usable for old data, but skip it in step navigation.
    return status.value !== 'documents';
  }

  async verifyStatusValue(
    statusValue: string,
  ): Promise<SpvApplicationStatusMaster> {
    const status = await this.spvApplicationStatusMasterRepository.findOne({
      where: {
        and: [{value: statusValue}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!status) {
      throw new HttpErrors.NotFound('No status found');
    }

    return status;
  }

  async fetchInitialStatus(): Promise<SpvApplicationStatusMaster> {
    const status = await this.spvApplicationStatusMasterRepository.findOne({
      where: {
        and: [{isInitial: true}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!status) {
      throw new HttpErrors.NotFound('Initial Status is missing');
    }

    return status;
  }

  async fetchNextStatus(
    sequenceOrder: number,
  ): Promise<SpvApplicationStatusMaster> {
    const statuses = await this.spvApplicationStatusMasterRepository.find({
      where: {
        and: [
          {sequenceOrder: {gt: sequenceOrder}},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      order: ['sequenceOrder ASC'],
    });
    const status = statuses.find(item => this.isVisibleFlowStatus(item));

    if (!status) {
      throw new HttpErrors.NotFound('Status is missing');
    }

    return status;
  }

  async fetchApplicationStatusById(
    id: string,
  ): Promise<SpvApplicationStatusMaster> {
    const status = await this.spvApplicationStatusMasterRepository.findOne({
      where: {
        and: [{id}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!status) {
      throw new HttpErrors.NotFound('No status found');
    }

    return status;
  }

  async fetchCompletedStepsSequence(currentSequenceOrder: number): Promise<
    {
      id: string;
      label: string;
      code: string;
    }[]
  > {
    const completedSteps: {id: string; label: string; code: string}[] = [];

    const statuses = await this.spvApplicationStatusMasterRepository.find({
      where: {
        and: [
          {sequenceOrder: {lte: currentSequenceOrder}},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      order: ['sequenceOrder ASC'],
    });

    for (const status of statuses.filter(item => this.isVisibleFlowStatus(item))) {
      completedSteps.push({
        id: status.id,
        label: status.status,
        code: status.value,
      });
    }

    return completedSteps;
  }
}
