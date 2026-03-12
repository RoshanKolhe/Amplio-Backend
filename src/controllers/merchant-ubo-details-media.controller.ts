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
  Media,
} from '../models';
import {MerchantUboDetailsRepository} from '../repositories';

export class MerchantUboDetailsMediaController {
  constructor(
    @repository(MerchantUboDetailsRepository)
    public merchantUboDetailsRepository: MerchantUboDetailsRepository,
  ) { }

  @get('/merchant-ubo-details/{id}/media', {
    responses: {
      '200': {
        description: 'Media belonging to MerchantUboDetails',
        content: {
          'application/json': {
            schema: getModelSchemaRef(Media),
          },
        },
      },
    },
  })
  async getMedia(
    @param.path.string('id') id: typeof MerchantUboDetails.prototype.id,
  ): Promise<Media> {
    return this.merchantUboDetailsRepository.panCard(id);
  }
}
