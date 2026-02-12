import {BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Transaction} from 'loopback-datasource-juggler';

import {
  BusinessKycDocumentTypeRepository,
  BusinessKycDpnRepository,
  BusinessKycRepository,
} from '../repositories';

@injectable({scope: BindingScope.TRANSIENT})
export class BusinessKycDpnService {
  constructor(
    @repository(BusinessKycDpnRepository)
    private dpnRepo: BusinessKycDpnRepository,

    @repository(BusinessKycDocumentTypeRepository)
    private docTypeRepo: BusinessKycDocumentTypeRepository,

    @repository(BusinessKycRepository)
    private kycRepo: BusinessKycRepository,
  ) {}

  /* ------------------------------------------------ */
  /* CREATE DPN (ONLY ONCE) */
  /* ------------------------------------------------ */

  async createDpn(businessKycId: string, companyId: string, tx: Transaction) {
    const existing = await this.dpnRepo.findOne(
      {where: {businessKycId}},
      {transaction: tx},
    );

    if (existing) return existing; // idempotent

    const docType = await this.docTypeRepo.findOne(
      {
        where: {
          sequenceOrder: 4,
          isActive: true,
          isDeleted: false,
        },
      },
      {transaction: tx},
    );

    if (!docType) {
      throw new HttpErrors.BadRequest('DPN document type is not configured');
    }

    if (!docType.fileTemplateId) {
      throw new HttpErrors.BadRequest('DPN template file is missing');
    }

    /* -------------------------------- */
    /* CREATE DPN */
    /* -------------------------------- */

    return this.dpnRepo.create(
      {
        businessKycId,
        companyProfilesId: companyId,
        businessKycDocumentTypeId: docType.id, // ⭐ IMPORTANT
        mediaId: docType.fileTemplateId, // ⭐ TEMPLATE
        status: 0,
        isAccepted: false,
      },
      {transaction: tx},
    );
  }

  /* ------------------------------------------------ */
  /* FETCH FOR UI */
  /* ------------------------------------------------ */

  async fetchDpn(businessKycId: string, tx?: Transaction) {
    const dpn = await this.dpnRepo.findOne(
      {
        where: {businessKycId},
        include: [
          {
            relation: 'businessKycDocumentType',
            scope: {
              fields: ['id', 'name', 'description', 'sequenceOrder'],
            },
          },
          {
            relation: 'media',
            scope: {
              fields: ['id', 'fileUrl', 'fileName'],
            },
          },
        ],
      },
      {transaction: tx},
    );

    if (!dpn) {
      throw new HttpErrors.NotFound('DPN not found');
    }

    return dpn;
  }

  /* ------------------------------------------------ */
  /* ACCEPT DPN */
  /* ------------------------------------------------ */

  async acceptDpn(businessKycId: string, isAccepted: boolean, tx: Transaction) {
    const dpn = await this.dpnRepo.findOne(
      {where: {businessKycId}},
      {transaction: tx},
    );

    if (!dpn) {
      throw new HttpErrors.NotFound('DPN not found');
    }

    if (dpn.status === 1) {
      throw new HttpErrors.BadRequest('DPN already finalized');
    }

    await this.dpnRepo.updateById(dpn.id, {isAccepted}, {transaction: tx});
  }

  /* ------------------------------------------------ */
  /* FINALIZE DPN */
  /* ------------------------------------------------ */

  async finalizeDpn(businessKycId: string, tx: Transaction) {
    const dpn = await this.dpnRepo.findOne(
      {where: {businessKycId}},
      {transaction: tx},
    );

    if (!dpn) {
      throw new HttpErrors.NotFound('DPN not found');
    }

    if (!dpn.isAccepted) {
      throw new HttpErrors.BadRequest(
        'Please accept the DPN before continuing',
      );
    }

    await this.dpnRepo.updateById(
      dpn.id,
      {
        status: 1,
        verifiedAt: new Date(),
      },
      {transaction: tx},
    );

    return dpn;
  }

  async updateAcceptanceById(
    dpnId: string,
    isAccepted: boolean,
    reason: string,
    tx: Transaction,
  ) {
    const dpn = await this.dpnRepo.findById(dpnId, undefined, {
      transaction: tx,
    });

    if (!dpn) {
      throw new HttpErrors.NotFound('Dpn not found');
    }

    if (dpn.status === 1) {
      throw new HttpErrors.BadRequest('Dpn already finalized');
    }

    await this.dpnRepo.updateById(dpnId, {isAccepted}, {transaction: tx});
  }

  /* ------------------------------------------------ */
  /* HELPER CHECK */
  /* ------------------------------------------------ */

  async isDpnAccepted(businessKycId: string, tx: Transaction) {
    const dpn = await this.dpnRepo.findOne(
      {where: {businessKycId}},
      {transaction: tx},
    );

    return dpn?.isAccepted ?? false;
  }

  async getDpnById(dpnId: string, tx: Transaction) {
    return this.dpnRepo.findById(dpnId, undefined, {
      transaction: tx,
    });
  }
}
