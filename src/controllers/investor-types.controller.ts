import {authenticate} from '@loopback/authentication';
import {
  Count,
  CountSchema,
  Filter,
  repository,
  Where
} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  post,
  requestBody,
  response
} from '@loopback/rest';
import {authorize} from '../authorization';
import {InvestorType} from '../models';
import {InvestorTypeRepository} from '../repositories';


export class InvestorTypesController {
  constructor(
    @repository(InvestorTypeRepository)
    public investorTypeRepository: InvestorTypeRepository
  ) { }
  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/investor-types')
  @response(200, {
    description: 'Investor model instance',
    content: {'application/json': {schema: getModelSchemaRef(InvestorType)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(InvestorType, {
            title: 'NewInvestorType',
            exclude: ['id'],
          }),
        },
      },
    })
    InvestorType: Omit<InvestorType, 'id'>,
  ): Promise<InvestorType> {
    return this.investorTypeRepository.create(InvestorType);
  }

  @get('/investor-types/count')
  @response(200, {
    description: 'InvestorType model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(InvestorType) where?: Where<InvestorType>,
  ): Promise<Count> {
    return this.investorTypeRepository.count(where);
  }

  @get('/investor-types')
  @response(200, {
    description: 'Array of InvestorType model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(InvestorType, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(InvestorType) filter?: Filter<InvestorType>,
  ): Promise<InvestorType[]> {
    return this.investorTypeRepository.find(filter);
  }
}
