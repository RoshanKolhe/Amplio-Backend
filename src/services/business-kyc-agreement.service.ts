import {BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Transaction} from 'loopback-datasource-juggler';

import {
  BusinessKycAgreementRepository,
  BusinessKycDocumentTypeRepository,
  BusinessKycRepository,
} from '../repositories';

@injectable({scope: BindingScope.TRANSIENT})
export class BusinessKycAgreementService {
  constructor(
    @repository(BusinessKycAgreementRepository)
    private agreementRepo: BusinessKycAgreementRepository,

    @repository(BusinessKycDocumentTypeRepository)
    private docTypeRepo: BusinessKycDocumentTypeRepository,

    @repository(BusinessKycRepository)
    private kycRepo: BusinessKycRepository,
  ) {}

  /* ------------------------------------------------ */
  /* CREATE AGREEMENTS (call when status becomes agreements) */
  /* ------------------------------------------------ */

  async createAgreements(
    businessKycId: string,
    companyId: string,
    tx: Transaction,
  ) {
    // prevent duplicate creation
    const existing = await this.agreementRepo.count(
      {businessKycId},
      {transaction: tx},
    );

    if (existing.count > 0) return;

    const docTypes = await this.docTypeRepo.find(
      {
        where: {isActive: true, isDeleted: false},
        order: ['sequenceOrder ASC'],
      },
      {transaction: tx},
    );

    if (!docTypes.length) {
      throw new HttpErrors.BadRequest('No document types configured');
    }

    const agreements = docTypes.map(d => ({
      businessKycId,
      companyProfilesId: companyId,
      businessKycDocumentTypeId: d.id,
      mediaId: d.fileTemplateId,
      status: 0, // pending
      isAccepted: false,
    }));

    await this.agreementRepo.createAll(agreements, {
      transaction: tx,
    });
  }

  /* ------------------------------------------------ */
  /* FETCH AGREEMENTS FOR UI */
  /* ------------------------------------------------ */

  async fetchAgreements(businessKycId: string, tx?: Transaction) {
    return this.agreementRepo.find(
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
            relation: 'media', // ⭐ ADD THIS
            scope: {
              fields: ['id', 'fileUrl', 'fileName'],
            },
          },
        ],
        order: ['createdAt ASC'], // fallback ordering
      },
      {transaction: tx},
    );
  }

  /* ------------------------------------------------ */
  /* ACCEPT SINGLE AGREEMENT */
  /* ------------------------------------------------ */

  // async acceptAgreement(agreementId: string, tx: Transaction) {
  //   const agreement = await this.agreementRepo.findById(
  //     agreementId,
  //     undefined,
  //     {transaction: tx},
  //   );

  //   if (!agreement) {
  //     throw new HttpErrors.NotFound('Agreement not found');
  //   }

  //   if (agreement.status === 1) {
  //     throw new HttpErrors.BadRequest('Agreement already finalized');
  //   }

  //   if (agreement.isAccepted) return;

  //   await this.agreementRepo.updateById(
  //     agreementId,
  //     {isAccepted: true},
  //     {transaction: tx},
  //   );
  // }

  /* ------------------------------------------------ */
  /* VALIDATE + FINAL APPROVE ALL AGREEMENTS */
  /* ------------------------------------------------ */

  async finalizeAgreements(businessKycId: string, tx: Transaction) {
    const agreements = await this.agreementRepo.find(
      {where: {businessKycId}},
      {transaction: tx},
    );

    if (!agreements.length) {
      throw new HttpErrors.BadRequest('No agreements found');
    }

    const allAccepted = agreements.every(a => a.isAccepted);

    if (!allAccepted) {
      throw new HttpErrors.BadRequest(
        'Please accept all agreements before continuing',
      );
    }

    const kyc = await this.kycRepo.findById(businessKycId, undefined, {
      transaction: tx,
    });

    if (!kyc) {
      throw new HttpErrors.BadRequest('OTP not verified');
    }

    await this.agreementRepo.updateAll(
      {
        status: 1, // approved
        verifiedAt: new Date(),
      },
      {businessKycId},
      {transaction: tx},
    );
  }

  // async updateAcceptanceByDocumentType(
  //   businessKycId: string,
  //   businessKycDocumentTypeId: string,
  //   isAccepted: boolean,
  //   reason: string,
  //   tx: Transaction,
  // ) {
  //   const agreement = await this.agreementRepo.findOne(
  //     {
  //       where: {
  //         businessKycId,
  //         businessKycDocumentTypeId,
  //       },
  //     },
  //     {transaction: tx},
  //   );

  //   if (!agreement) {
  //     throw new HttpErrors.NotFound('Agreement not found');
  //   }

  //   // optional lock check
  //   if (agreement.status === 1) {
  //     throw new HttpErrors.BadRequest('Agreement already finalized');
  //   }

  //   await this.agreementRepo.updateById(
  //     agreement.id,
  //     {isAccepted, reason},
  //     {transaction: tx},
  //   );
  // }
  async updateAcceptanceById(
    agreementId: string,
    isAccepted: boolean,
    reason: string,
    tx: Transaction,
  ) {
    const agreement = await this.agreementRepo.findById(
      agreementId,
      undefined,
      {transaction: tx},
    );

    if (!agreement) {
      throw new HttpErrors.NotFound('Agreement not found');
    }

    if (agreement.status === 1) {
      throw new HttpErrors.BadRequest('Agreement already finalized');
    }

    await this.agreementRepo.updateById(
      agreementId,
      {isAccepted, reason},
      {transaction: tx},
    );
  }

  async areAllAccepted(businessKycId: string, tx: Transaction) {
    const agreements = await this.agreementRepo.find(
      {where: {businessKycId}},
      {transaction: tx},
    );

    return agreements.every(a => a.isAccepted);
  }

  async areAllSigned(businessKycId: string, tx: Transaction) {
    const agreements = await this.agreementRepo.find(
      {
        where: {
          businessKycId,
          mediaId: {neq: undefined}, // signed doc exists
        },
      },
      {transaction: tx},
    );

    const total = await this.agreementRepo.count(
      {businessKycId},
      {transaction: tx},
    );

    return agreements.length === total.count;
  }

  async fetchNextPendingAgreement(businessKycId: string, tx: Transaction) {
    return this.agreementRepo.findOne(
      {
        where: {
          businessKycId,
          isAccepted: false,
          isActive: true,
          isDeleted: false,
        },
        include: [
          {
            relation: 'businessKycDocumentType',
            scope: {
              fields: ['id', 'name', 'sequenceOrder'],
            },
          },
        ],
      },
      {transaction: tx},
    );
  }
}
