import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SpvApplicationStatusMaster} from '../models';
import {SpvApplicationStatusMasterRepository} from '../repositories';

export class SpvApplicationStatusService {
  constructor(
    @repository(SpvApplicationStatusMasterRepository)
    private spvApplicationStatusMasterRepository: SpvApplicationStatusMasterRepository,
  ) {}

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
    const status = await this.spvApplicationStatusMasterRepository.findOne({
      where: {
        and: [
          {sequenceOrder: sequenceOrder + 1},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

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

    for (let count = 1; count <= currentSequenceOrder; count++) {
      const status = await this.spvApplicationStatusMasterRepository.findOne({
        where: {
          and: [
            {sequenceOrder: count},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

      if (!status) {
        throw new HttpErrors.BadRequest('Invalid Status value');
      }

      completedSteps.push({
        id: status.id,
        label: status.status,
        code: status.value,
      });
    }

    return completedSteps;
  }
}
