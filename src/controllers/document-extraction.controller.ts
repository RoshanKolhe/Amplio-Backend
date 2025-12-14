/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {
  post,
  Request,
  requestBody,
  Response,
  RestBindings,
} from '@loopback/rest';
import multer from 'multer';
import {DocumentExtractionService} from '../services/document-extraction.service';

export class DocumentExtractionController {
  constructor(
    @inject('service.documentExtraction.service')
    private documentExtractionService: DocumentExtractionService,
  ) { }

  private multerHandler = multer({storage: multer.memoryStorage()}).any();

  private handleUpload(request: Request, response: Response): Promise<Express.Multer.File[]> {
    return new Promise((resolve, reject) => {
      this.multerHandler(request, response, (err: any) => {
        if (err) reject(err);
        else resolve(request.files as Express.Multer.File[]);
      });
    });
  }

  // extract pan info ....
  @post('/extract/pan-info', {
    responses: {
      '200': {
        description: 'Extract PAN card info',
        content: {'application/json': {schema: {type: 'object'}}},
      },
    },
  })
  async extractPanInfo(
    @requestBody.file()
    request: Request,
    @inject(RestBindings.Http.RESPONSE)
    response: Response,
  ): Promise<{success: boolean; message: string; data: object}> {
    const uploadedFiles = await this.handleUpload(request, response);;

    if (!uploadedFiles || uploadedFiles.length === 0) {
      throw new Error('No file uploaded');
    }

    // take first file
    const file = uploadedFiles[0];

    // send to OCR extraction service
    const result = await this.documentExtractionService.panCardFieldExtraction(
      file.buffer,
    );

    const newResult = {
      extractedPanNumber: result.pan_number || '',
      extractedPanHolderName: result.pan_holder_name || '',
      extractedDateOfBirth: result.date_of_birth || ''
    }

    return {
      success: true,
      message: "Pan info fetched",
      data: newResult,
    };
  }

  // extract company info using CIN ....
  @post('/extraction/company-info', {
    responses: {
      '200': {
        description: 'Extract company info',
        content: {'application/json': {schema: {type: 'object'}}},
      },
    },
  })
  async extractCompanyInfo(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['CIN'],
            properties: {
              CIN: {
                type: 'string',
                pattern: '^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'
              },
            }
          }
        }
      }
    })
    body: {
      CIN: string;
    }
  ): Promise<{success: boolean; message: string; data: object}> {
    const response: any = await this.documentExtractionService.extractCompanyInfo(body.CIN);
    const newResult = {
      companyName: response.company_name || '',
      gstin: response.gstin || '',
      dateOfIncorporation: response.date_of_incorporation || '',
      cityOfIncorporation: response.city_of_incorporation || '',
      stateOfIncorporation: response.state_of_incorporation || '',
      countryOfIncorporation: response.country_of_incorporation || '',
      companyPanNumber: response.company_pan_number || ''
    }
    return {
      success: true,
      message: 'Company info fetched',
      data: newResult
    }
  }
}
