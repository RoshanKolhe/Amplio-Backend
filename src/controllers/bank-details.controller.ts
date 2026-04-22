import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, FilterExcludingWhere, repository} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
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
  ) {}

  @authenticate('jwt')
  @authorize({
    roles: ['super_admin', 'company', 'trustee', 'investor', 'merchant'],
    allowedScopes: ['kyc_onboarding'],
  })
  @get('/bank-details/get-by-ifsc/{ifscCode}')
  async fetchBankInfo(
    @param.path.string('ifscCode') ifscCode: string,
  ): Promise<{success: boolean; message: string; bankDetails: object}> {
    const bankDetails = await this.bankDetailsService.extractBankInfo(ifscCode);
    return {
      success: true,
      message: 'Bank Details',
      bankDetails: bankDetails,
    };
  }

  @authenticate('jwt')
  @authorize({
    roles: ['super_admin', 'company', 'trustee', 'investor', 'merchant'],
    allowedScopes: ['kyc_onboarding'],
  })
  @post('/bank-details/verify-account')
  @response(200, {
    description: 'Verify bank account with Perfios',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: {type: 'boolean'},
            message: {type: 'string'},
            data: {type: 'object'},
          },
        },
      },
    },
  })
  async verifyAccount(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['accountNumber', 'ifscCode', 'accountHolderName'],
            properties: {
              accountNumber: {type: 'string'},
              ifscCode: {type: 'string'},
              accountHolderName: {type: 'string'},
              usersId: {type: 'string'},
              roleValue: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      accountNumber: string;
      ifscCode: string;
      accountHolderName: string;
      usersId?: string;
      roleValue?: string;
    },
  ): Promise<object> {
    if (body.usersId && body.usersId !== currentUser.id) {
      throw new HttpErrors.Forbidden(
        'You can only verify bank accounts for your own user',
      );
    }

    const supportedRoleValues = ['merchant', 'company', 'trustee', 'investor'];
    const requestedRoleValue = body.roleValue?.trim();
    const roleValue =
      requestedRoleValue && requestedRoleValue.length > 0
        ? requestedRoleValue
        : (currentUser.roles.find((role: string) =>
            supportedRoleValues.includes(role),
          ) ?? 'merchant');

    if (!currentUser.roles.includes(roleValue) && roleValue !== 'merchant') {
      throw new HttpErrors.Forbidden(
        'You can only verify bank accounts for your own role',
      );
    }

    return this.bankDetailsService.verifyWithPerfios({
      accountNumber: body.accountNumber,
      ifscCode: body.ifscCode,
      accountHolderName: body.accountHolderName,
      usersId: currentUser.id,
      roleValue,
    });
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
    @param.filter(BankDetails, {exclude: 'where'})
    filter?: FilterExcludingWhere<BankDetails>,
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
