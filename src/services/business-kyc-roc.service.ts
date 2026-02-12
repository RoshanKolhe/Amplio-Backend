import {injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Transaction} from 'loopback-datasource-juggler';

import {RocRepository} from '../repositories';
import {BusinessKycRepository} from '../repositories';
import {Roc} from '../models';

@injectable()
export class BusinessKycRocService {
  constructor(
    @repository(RocRepository)
    private rocRepository: RocRepository,

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
