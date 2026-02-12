import {BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Transaction} from 'loopback-datasource-juggler';

import {
  BusinessKycAgreementRepository,
  BusinessKycDocumentTypeRepository,
  BusinessKycRepository,
} from '../repositories';

const AGREEMENT_WORKFLOW = [
  'sanction_letter',
  'platform_agreement',
  'deed_of_hypothecation',
];

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
        where: {
          value: {inq: AGREEMENT_WORKFLOW},
          isActive: true,
          isDeleted: false,
        },
      },
      {transaction: tx},
    );

    console.log('WORKFLOW:', AGREEMENT_WORKFLOW);
    console.log('FOUND DOC TYPES:', docTypes);
    if (!docTypes.length) {
      throw new HttpErrors.BadRequest('No document types configured');
    }

    const orderedDocTypes = AGREEMENT_WORKFLOW.map(workflowName => {
      const doc = docTypes.find(d => d.value === workflowName);

      if (!doc) {
        throw new HttpErrors.BadRequest(
          `Document type missing: ${workflowName}`,
        );
      }
      return doc;
    });

    const agreements = orderedDocTypes.map((d, index) => ({
      businessKycId,
      companyProfilesId: companyId,
      businessKycDocumentTypeId: d.id,
      mediaId: d.fileTemplateId,
      status: 0,
      isAccepted: false,
      sequenceOrder: index + 1,
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
        order: ['sequenceOrder ASC'],
      },
      {transaction: tx},
    );
  }

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
    const agreement = await this.agreementRepo.findOne(
      {
        where: {
          businessKycId,
          isAccepted: false,
          isActive: true,
          isDeleted: false,
        },
        order: ['sequenceOrder ASC'],
        include: [
          {
            relation: 'businessKycDocumentType',
          },
          {relation: 'media'},
        ],
      },
      {transaction: tx},
    );

    if (agreement) {
      return agreement;
    }
    return null;
  }

  async getAgreementById(agreementId: string, tx: Transaction) {
    return this.agreementRepo.findById(agreementId, undefined, {
      transaction: tx,
    });
  }
}
