import {
  repository,
} from '@loopback/repository';
import {
  param,
  get,
  getModelSchemaRef,
} from '@loopback/rest';
import {
  MerchantUboDetails,
  Users,
} from '../models';
import {MerchantUboDetailsRepository} from '../repositories';

export class MerchantUboDetailsUsersController {
  constructor(
    @repository(MerchantUboDetailsRepository)
    public merchantUboDetailsRepository: MerchantUboDetailsRepository,
  ) { }

  @get('/merchant-ubo-details/{id}/users', {
    responses: {
      '200': {
        description: 'Users belonging to MerchantUboDetails',
        content: {
          'application/json': {
            schema: getModelSchemaRef(Users),
          },
        },
      },
    },
  })
  async getUsers(
    @param.path.string('id') id: typeof MerchantUboDetails.prototype.id,
  ): Promise<Users> {
    return this.merchantUboDetailsRepository.users(id);
  }
}
