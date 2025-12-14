import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {
  Filter,
  FilterExcludingWhere,
  repository,
} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {authorize} from '../authorization';
import {BankDetails} from '../models';
import {BankDetailsRepository} from '../repositories';
import {BankDetailsService} from '../services/bank-details.service';

export class BankDetailsController {
  constructor(
    @repository(BankDetailsRepository)
    public bankDetailsRepository: BankDetailsRepository,
    @inject('service.bankDetails.service')
    private bankDetailsService: BankDetailsService,
  ) { }

  @get('/bank-details/get-by-ifsc/{ifscCode}')
  async fetchBankInfo(
    @param.path.string('ifscCode') ifscCode: string
  ): Promise<{success: boolean; message: string; bankDetails: object}> {
    const bankDetails = await this.bankDetailsService.extractBankInfo(ifscCode);
    return {
      success: true,
      message: 'Bank Details',
      bankDetails: bankDetails
    }
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin', 'company', 'trustee', 'investor']})
  @post('/bank-details')
  @response(200, {
    description: 'BankDetails model instance',
    content: {'application/json': {schema: getModelSchemaRef(BankDetails)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BankDetails, {
            title: 'NewBankDetails',
            exclude: ['id'],
          }),
        },
      },
    })
    bankDetails: Omit<BankDetails, 'id'>,
  ): Promise<BankDetails> {
    return this.bankDetailsRepository.create(bankDetails);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin', 'company', 'trustee', 'investor']})
  @get('/bank-details')
  @response(200, {
    description: 'Array of BankDetails model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(BankDetails, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(BankDetails) filter?: Filter<BankDetails>,
  ): Promise<BankDetails[]> {
    return this.bankDetailsRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin', 'company', 'trustee', 'investor']})
  @get('/bank-details/{id}')
  @response(200, {
    description: 'BankDetails model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(BankDetails, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(BankDetails, {exclude: 'where'}) filter?: FilterExcludingWhere<BankDetails>
  ): Promise<BankDetails> {
    return this.bankDetailsRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin', 'company', 'trustee', 'investor']})
  @patch('/bank-details/{id}')
  @response(204, {
    description: 'BankDetails PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BankDetails, {partial: true}),
        },
      },
    })
    bankDetails: BankDetails,
  ): Promise<void> {
    await this.bankDetailsRepository.updateById(id, bankDetails);
  }
}
