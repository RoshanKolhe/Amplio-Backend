import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {ComplianceAndDeclarations} from '../models';
import {ComplianceAndDeclarationsRepository} from '../repositories';

export class ComplianceAndDeclarationsService {
  constructor(
    @repository(ComplianceAndDeclarationsRepository)
    private complianceAndDeclarationsRepository: ComplianceAndDeclarationsRepository,
  ) {}

  async createOrUpdateComplianceDeclaration(
    complianceData: Partial<ComplianceAndDeclarations>,
  ): Promise<{
    success: boolean;
    message: string;
    complianceDeclaration: ComplianceAndDeclarations;
  }> {
    if (
      !complianceData.usersId ||
      !complianceData.identifierId ||
      !complianceData.roleValue
    ) {
      throw new HttpErrors.BadRequest(
        'usersId, identifierId and roleValue are required',
      );
    }

    const existingComplianceDeclaration =
      await this.complianceAndDeclarationsRepository.findOne({
        where: {
          and: [
            {usersId: complianceData.usersId},
            {identifierId: complianceData.identifierId},
            {roleValue: complianceData.roleValue},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (existingComplianceDeclaration) {
      await this.complianceAndDeclarationsRepository.updateById(
        existingComplianceDeclaration.id,
        {
          ...complianceData,
          status: complianceData.status ?? 1,
          mode: 1,
          reason: undefined,
          verifiedAt:
            (complianceData.status ?? 1) === 1 ? new Date() : undefined,
        },
      );

      const updatedComplianceDeclaration =
        await this.complianceAndDeclarationsRepository.findById(
          existingComplianceDeclaration.id,
        );

      return {
        success: true,
        message: 'Compliance and declarations updated successfully',
        complianceDeclaration: updatedComplianceDeclaration,
      };
    }

    const complianceDeclaration =
      await this.complianceAndDeclarationsRepository.create({
        ...complianceData,
        status: complianceData.status ?? 1,
        mode: complianceData.mode ?? 1,
        verifiedAt:
          (complianceData.status ?? 1) === 1 ? new Date() : undefined,
        isActive: complianceData.isActive ?? true,
        isDeleted: complianceData.isDeleted ?? false,
      });

    return {
      success: true,
      message: 'Compliance and declarations saved successfully',
      complianceDeclaration,
    };
  }

  async fetchUserComplianceDeclaration(
    usersId: string,
    roleValue: string,
    identifierId: string,
  ): Promise<{
    success: boolean;
    message: string;
    complianceDeclaration: ComplianceAndDeclarations | null;
  }> {
    const complianceDeclaration =
      await this.complianceAndDeclarationsRepository.findOne({
        where: {
          and: [
            {usersId},
            {roleValue},
            {identifierId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    return {
      success: true,
      message: 'Compliance and declarations',
      complianceDeclaration,
    };
  }
}
