import {
  repository,
} from '@loopback/repository';
import {
  param,
  get,
  getModelSchemaRef,
} from '@loopback/rest';
import {
  CompanyKycDocument,
  Users,
} from '../models';
import {CompanyKycDocumentRepository} from '../repositories';

export class CompanyKycDocumentUsersController {
  constructor(
    @repository(CompanyKycDocumentRepository)
    public companyKycDocumentRepository: CompanyKycDocumentRepository,
  ) { }

  @get('/company-kyc-documents/{id}/users', {
    responses: {
      '200': {
        description: 'Users belonging to CompanyKycDocument',
        content: {
          'application/json': {
            schema: getModelSchemaRef(Users),
          },
        },
      },
    },
  })
  async getUsers(
    @param.path.string('id') id: typeof CompanyKycDocument.prototype.id,
  ): Promise<Users> {
    return this.companyKycDocumentRepository.users(id);
  }
}
