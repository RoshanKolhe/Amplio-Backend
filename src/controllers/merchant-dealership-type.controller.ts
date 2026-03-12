import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  requestBody,
  response,
} from '@loopback/rest';
import {MerchantDealershipType} from '../models';
import {MerchantDealershipTypeRepository} from '../repositories';
import {authenticate} from '@loopback/authentication';
import {authorize} from '../authorization';

export class MerchantDealershipTypeController {
  constructor(
    @repository(MerchantDealershipTypeRepository)
    public merchantDealershipTypeRepository: MerchantDealershipTypeRepository
    ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/dealership-types')
  @response(200, {
    description: 'Dealership model instance',
    content: {'application/json': {schema: getModelSchemaRef(MerchantDealershipType)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(MerchantDealershipType, {
            title: 'NewMerchantDealershipType',
            exclude: ['id'],
          }),
        },
      },
    })
    MerchantDealershipType: Omit<MerchantDealershipType, 'id'>,
  ): Promise<MerchantDealershipType> {
    return this.merchantDealershipTypeRepository.create(MerchantDealershipType);
  }

  @get('/dealership-types/count')
  @response(200, {
    description: 'MerchantDealershipType model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(MerchantDealershipType) where?: Where<MerchantDealershipType>,
  ): Promise<Count> {
    return this.merchantDealershipTypeRepository.count(where);
  }

  @get('/dealership-types')
  @response(200, {
    description: 'Array of MerchantDealershipType model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(MerchantDealershipType, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(MerchantDealershipType) filter?: Filter<MerchantDealershipType>,
  ): Promise<MerchantDealershipType[]> {
    return this.merchantDealershipTypeRepository.find(filter);
  }
}
