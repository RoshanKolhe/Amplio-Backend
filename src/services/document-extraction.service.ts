/* eslint-disable @typescript-eslint/no-explicit-any */
import {BindingScope, injectable} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import axios from 'axios';
import FormData from 'form-data';

@injectable({scope: BindingScope.TRANSIENT})
export class DocumentExtractionService {
  constructor() { }

  // PAN card extraction
  async panCardFieldExtraction(panCardFile: Buffer) {
    try {
      const formData = new FormData();

      // MUST include file name and content type
      formData.append('pan_card_file', panCardFile, {
        filename: 'pan.jpg',
        contentType: 'image/jpeg',
      });

      const response: any = await axios.post(
        `${process.env.SERVER_ENDPOINT}/api/kyc/issuer_kyc/pan-extraction/`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          maxBodyLength: Infinity,
        } as any,
      );

      if (response.data.success === false) {
        throw new HttpErrors.BadRequest(`${response.data.message}`);
      };

      return response?.data?.data;
    } catch (error) {
      console.error(
        'error while extracting data from PAN card: ',
        error?.response?.data || error.message,
      );
      throw error;
    }
  }

  async extractCompanyInfo(cin: string) {
    try {
      const response: any = await axios.get(
        `${process.env.SERVER_ENDPOINT}/api/kyc/issuer_kyc/company-info/cin/${cin}/`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.success === false) {
        throw new HttpErrors.BadRequest(`${response.data.message}`);
      };

      return response.data.data;
    } catch (error) {
      console.error(
        'error while extracting data using Company CIN: ',
        error?.response?.data || error.message,
      );
      throw error;
    }
  }
}
