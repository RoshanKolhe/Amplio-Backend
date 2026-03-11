import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, HttpErrors, param} from '@loopback/rest';
import {authorize} from '../authorization';
import {CompanyDataMapperService} from '../services/company-brisk-data-mapper.service';

export class IssuerDirectoryController {
  constructor(
    @inject('service.companyDataMapper.service')
    private companyDataMapperService: CompanyDataMapperService,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/issuer-directory/{cin}/outstanding-borrowings')
  async fetchOutstandingBorrowings(
    @param.path.string('cin') cin: string,
  ): Promise<{success: boolean; message: string; data: unknown}> {
    const data = await this.companyDataMapperService.fetchOutstandingBorrowingsData(cin);

    if (!data) {
      throw new HttpErrors.NotFound('Outstanding borrowings data not found');
    }

    return {
      success: true,
      message: 'Outstanding borrowings data fetched',
      data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/issuer-directory/{cin}/financials')
  async fetchCompanyFinancials(
    @param.path.string('cin') cin: string,
  ): Promise<{success: boolean; message: string; data: unknown}> {
    const data = await this.companyDataMapperService.fetchCompanyFinancials(cin);

    if (!data) {
      throw new HttpErrors.NotFound('Company financials data not found');
    }

    return {
      success: true,
      message: 'Company financials data fetched',
      data,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['company']})
  @get('/issuer-directory/{cin}/credit-rating')
  async fetchCompanyCreditRating(
    @param.path.string('cin') cin: string,
  ): Promise<{success: boolean; message: string; data: unknown}> {
    const data = await this.companyDataMapperService.fetchCompanyCreditRating(cin);

    if (!data) {
      throw new HttpErrors.NotFound('Company credit rating data not found');
    }

    return {
      success: true,
      message: 'Company credit rating data fetched',
      data,
    };
  }
}
