import {injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Transaction} from 'loopback-datasource-juggler';

import {
  BusinessKycDocumentTypeRepository,
  RocRepository,
} from '../repositories';
import {BusinessKycRepository} from '../repositories';
import {Roc} from '../models';

@injectable()
export class BusinessKycRocService {
  constructor(
    @repository(RocRepository)
    private rocRepository: RocRepository,

    @repository(BusinessKycDocumentTypeRepository)
    private docTypeRepo: BusinessKycDocumentTypeRepository,

    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,
  ) {}
  async createAndUpdateRoc(
    businessKycId: string,
    payload: Partial<Roc>,
    tx: Transaction,
  ) {
    // ✅ Validate KYC
    const kyc = await this.businessKycRepository.findById(
      businessKycId,
      undefined,
      {transaction: tx},
    );

    if (!kyc) {
      throw new HttpErrors.NotFound('Business KYC not found');
    }

    // ✅ Check if ROC already exists
    const existingRoc = await this.rocRepository.findOne(
      {where: {businessKycId}},
      {transaction: tx},
    );

    // ⭐ UPDATE FLOW
    if (existingRoc) {
      await this.rocRepository.updateById(existingRoc.id, payload, {
        transaction: tx,
      });

      return {
        success: true,
        message: 'ROC updated successfully',
        rocId: existingRoc.id,
      };
    }

    // ⭐ CREATE FLOW
    const roc = await this.rocRepository.create(
      {
        ...payload,
        businessKycId,
      },
      {transaction: tx},
    );

    return {
      success: true,
      message: 'ROC created successfully',
      rocId: roc.id,
    };
  }

  async createRoc(businessKycId: string, companyId: string, tx: Transaction) {
    const existing = await this.rocRepository.findOne(
      {where: {businessKycId}},
      {transaction: tx},
    );

    if (existing) return existing; // idempotent

    const docType = await this.docTypeRepo.findOne(
      {
        where: {
          value: 'roc', // ⭐ your master value
          isActive: true,
          isDeleted: false,
        },
      },
      {transaction: tx},
    );

    if (!docType) {
      throw new HttpErrors.BadRequest('ROC document type is not configured');
    }

    if (!docType.fileTemplateId) {
      throw new HttpErrors.BadRequest('ROC template file is missing');
    }

    return this.rocRepository.create(
      {
        businessKycId,
        companyProfilesId: companyId,
        businessKycDocumentTypeId: docType.id,
        chargeFilingId: docType.fileTemplateId, // ⭐ template
        status: 0,
        isAccepted: false,
        isNashActivate: false,
      },
      {transaction: tx},
    );
  }

  async fetchByKyc(businessKycId: string) {
    const roc = await this.rocRepository.findOne({
      where: {businessKycId},
      include: [
        {relation: 'chargeFiling'},
        {relation: 'backupSecurity'},
        {relation: 'businessKyc'},
      ],
    });

    if (!roc) {
      throw new HttpErrors.NotFound('ROC not found');
    }

    return roc;
  }

  async fetchRoc(businessKycId: string, tx?: Transaction) {
    return this.rocRepository.find(
      {
        where: {
          businessKycId,
          isActive: true,
          isDeleted: false,
        },
        include: [
          {
            relation: 'businessKycDocumentType',
            scope: {
              fields: ['id', 'name', 'description', 'sequenceOrder'],
            },
          },
          {
            relation: 'chargeFiling',
            scope: {
              fields: ['id', 'fileUrl', 'fileName'],
            },
          },
        ],
      },
      {transaction: tx},
    );
  }

  async findOrFailByKycId(businessKycId: string, tx?: Transaction) {
    const roc = await this.rocRepository.findOne(
      {where: {businessKycId}},
      {transaction: tx},
    );

    if (!roc) {
      return null;
    }

    return roc;
  }
}
