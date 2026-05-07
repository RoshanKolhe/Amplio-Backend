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
  ) {}

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-management/list')
  async getSpvManagementList(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    data: SpvManagementListItem[];
  }> {
    const trusteeProfile = await this.verifyTrustee(currentUser.id);
    const data = await this.spvManagementService.getSpvManagementList(
      trusteeProfile.id,
    );

    return {
      success: true,
      message: 'SPV management list',
      data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-management/summary')
  async getSpvManagementSummary(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ): Promise<{
    success: boolean;
    message: string;
    data: SpvManagementSummary;
  }> {
    const trusteeProfile = await this.verifyTrustee(currentUser.id);
    const data = await this.spvManagementService.getSpvManagementSummary(
      trusteeProfile.id,
    );

    return {
      success: true,
      message: 'SPV management summary',
      data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['trustee']})
  @get('/spv-management/{spvId}/pools')
  async getSpvManagementPools(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.path.string('spvId') spvId: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: SpvManagementPoolItem[];
  }> {
    const trusteeProfile = await this.verifyTrustee(currentUser.id);
    const data = await this.spvManagementService.getSpvPools(
      trusteeProfile.id,
      spvId,
    );

    return {
      success: true,
      message: 'SPV pools',
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
