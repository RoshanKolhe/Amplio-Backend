import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {BusinessKycStatusMaster} from '../models';
import {
  BusinessKycRepository,
  BusinessKycStatusMasterRepository,
} from '../repositories';

export class BusinessKycStatusService {
  constructor(
    @repository(BusinessKycStatusMasterRepository)
    private businessKycStatusMasterRepository: BusinessKycStatusMasterRepository,
    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,
  ) {}

  // verify status by value...
  async verifyStatusValue(
    statusValue: string,
  ): Promise<BusinessKycStatusMaster> {
    const status = await this.businessKycStatusMasterRepository.findOne({
      where: {
        and: [{value: statusValue}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!status) {
      throw new HttpErrors.NotFound('No status found');
    }

    return status;
  }

  // Fetch Initial Status
  async fetchInitialStatus(): Promise<BusinessKycStatusMaster> {
    const status = await this.businessKycStatusMasterRepository.findOne({
      where: {
        and: [{isInitial: true}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!status) {
      throw new HttpErrors.NotFound('Initial Status is missing');
    }

    return status;
  }

  // fetch next status with sequence order
  async fetchNextStatus(
    sequenceOrder: number,
  ): Promise<BusinessKycStatusMaster> {
    const status = await this.businessKycStatusMasterRepository.findOne({
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

  // fetch application status by id
  async fetchApplicationStatusById(
    id: string,
  ): Promise<BusinessKycStatusMaster> {
    const status = await this.businessKycStatusMasterRepository.findOne({
      where: {
        and: [{id: id}, {isActive: true}, {isDeleted: false}],
      },
    });

    // later we will check for approvals and documents condition too..

    if (!status) {
      throw new HttpErrors.NotFound('No status found');
    }

    return status;
  }

  // fetch completed steps sequence
  async fetchCompletedStepsSequence(currentSequenceOrder: number): Promise<
    {
      id: string;
      label: string;
      code: string;
    }[]
  > {
    const completedSteps: {
      id: string;
      label: string;
      code: string;
    }[] = [];

    for (let count = 1; count <= currentSequenceOrder; count++) {
      const status = await this.businessKycStatusMasterRepository.findOne({
        where: {
          and: [{sequenceOrder: count}, {isActive: true}, {isDeleted: false}],
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

  async advanceBusinessKycStatus(businessKycId: string): Promise<{
    currentStatus: {
      id: string;
      label: string;
      code: string;
    };
  }> {
    const kyc = await this.businessKycRepository.findById(businessKycId);

    if (!kyc.businessKycStatusMasterId) {
      throw new HttpErrors.BadRequest('KYC status not initialized');
    }

    const currentStatus = await this.fetchApplicationStatusById(
      kyc.businessKycStatusMasterId,
    );

    const nextStatus = await this.fetchNextStatus(currentStatus.sequenceOrder);

    await this.businessKycRepository.updateById(businessKycId, {
      businessKycStatusMasterId: nextStatus.id,
      status: nextStatus.value,
    });

    return {
      currentStatus: {
        id: nextStatus.id,
        label: nextStatus.status,
        code: nextStatus.value,
      },
    };
  }
}
