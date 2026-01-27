// Uncomment these imports to begin using these cool features!
import {
  Filter,
  repository
} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  post,
  requestBody,
  response
} from '@loopback/rest';

import {authenticate} from '@loopback/authentication';
import {authorize} from '../authorization';
import {BusinessKycStatusMaster} from '../models';
import {BusinessKycStatusMasterRepository} from '../repositories';

// import {inject} from '@loopback/core';


export class BusinessKycStatusMasterController {
  constructor(
    @repository(BusinessKycStatusMasterRepository)
    public businessKycStatusMasterRepository: BusinessKycStatusMasterRepository
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/business-kyc-status-masters')
  @response(200, {
    description: 'BusinessKycStatusMaster model instance',
    content: {'application/json': {schema: getModelSchemaRef(BusinessKycStatusMaster)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BusinessKycStatusMaster, {
            title: 'NewBusinessKycStatusMaster',
            exclude: ['id'],
          }),
        },
      },
    })
    businessKycStatusMaster: Omit<BusinessKycStatusMaster, 'id'>,
  ): Promise<BusinessKycStatusMaster> {
    return this.businessKycStatusMasterRepository.create(businessKycStatusMaster);
  }


  @authenticate('jwt')
  @get('/bond-application-status-masters')
  @response(200, {
    description: 'Array of BondApplicationStatusMaster model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(BusinessKycStatusMaster, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(BusinessKycStatusMaster) filter?: Filter<BusinessKycStatusMaster>,
  ): Promise<BusinessKycStatusMaster[]> {
    return this.businessKycStatusMasterRepository.find(filter);
  }

}
