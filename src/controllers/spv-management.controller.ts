import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {get, HttpErrors, param} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {TrusteeProfiles} from '../models';
import {TrusteeProfilesRepository} from '../repositories';
import {
  SpvManagementListItem,
  SpvManagementPoolItem,
  SpvManagementService,
  SpvManagementSummary,
} from '../services/spv-management.service';

export class SpvManagementController {
  constructor(
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @inject('service.spvManagement.service')
    private spvManagementService: SpvManagementService,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['trustee', 'super_admin']})
  @get('/spv-management/list')
  async getSpvManagementList(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    data: SpvManagementListItem[];
  }> {
    const data = currentUser.roles?.includes('super_admin')
      ? await this.spvManagementService.getSpvManagementListForAdmin()
      : await this.spvManagementService.getSpvManagementList(
          (await this.verifyTrustee(currentUser.id)).id,
        );

    return {
      success: true,
      message: 'SPV management list',
      data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee', 'super_admin']})
  @get('/spv-management/summary')
  async getSpvManagementSummary(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    data: SpvManagementSummary;
  }> {
    const data = currentUser.roles?.includes('super_admin')
      ? await this.spvManagementService.getSpvManagementSummaryForAdmin()
      : await this.spvManagementService.getSpvManagementSummary(
          (await this.verifyTrustee(currentUser.id)).id,
        );

    return {
      success: true,
      message: 'SPV management summary',
      data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee', 'super_admin']})
  @get('/spv-management/{spvId}/pools')
  async getSpvManagementPools(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: SpvManagementPoolItem[];
  }> {
    const data = currentUser.roles?.includes('super_admin')
      ? await this.spvManagementService.getSpvPoolsForAdmin(spvId)
      : await this.spvManagementService.getSpvPools(
          (await this.verifyTrustee(currentUser.id)).id,
          spvId,
        );

    return {
      success: true,
      message: 'SPV pools',
      data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee', 'super_admin']})
  @get('/spv-management/{spvId}/unallocated-funds')
  async getSpvManagementUnallocatedFunds(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: unknown[];
  }> {
    const data = currentUser.roles?.includes('super_admin')
      ? await this.spvManagementService.getUnallocatedFundsForAdmin(spvId)
      : await this.spvManagementService.getUnallocatedFunds(
          (await this.verifyTrustee(currentUser.id)).id,
          spvId,
        );

    return {
      success: true,
      message: 'SPV unallocated funds',
      data,
    };
  }

  private async verifyTrustee(usersId: string): Promise<TrusteeProfiles> {
    const trusteeProfile = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [{usersId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!trusteeProfile) {
      throw new HttpErrors.NotFound('No Trustee found');
    }

    return trusteeProfile;
  }
}
