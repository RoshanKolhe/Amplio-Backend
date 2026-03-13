import {injectable, BindingScope} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {
  PspRepository,
  PspMasterRepository,
  PspMasterFieldsRepository,
} from '../repositories';
import {Psp} from '../models';

@injectable({scope: BindingScope.TRANSIENT})
export class PspService {
  constructor(
    @repository(PspRepository)
    public pspRepository: PspRepository,

    @repository(PspMasterRepository)
    public pspMasterRepository: PspMasterRepository,

    @repository(PspMasterFieldsRepository)
    public pspMasterFieldsRepository: PspMasterFieldsRepository,
  ) {}

  async fetchMerchantPsp(usersId: string, merchantProfilesId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const psp: any[] = await this.pspRepository.find({
      where: {
        usersId,
        merchantProfilesId,
        isActive: true,
        isDeleted: false,
      },
      include: [
        {
          relation: 'pspMaster',
          scope: {
            include: [
              {
                relation: 'pspMasterFields',
                scope: {
                  order: ['order ASC'],
                },
              },
            ],
          },
        },
      ],
    });

    return {
      success: true,
      message: 'Merchant PSP fetched',
      psp,
    };
  }

  async upsertMerchantPsp(
    merchantProfilesId: string,
    usersId: string,
    payload: Partial<Psp>,
    pspId: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ) {
    if (!payload.pspMasterId) {
      throw new HttpErrors.BadRequest('pspMasterId is required');
    }

    const pspMaster = await this.pspMasterRepository.findById(
      payload.pspMasterId,
    );

    if (!pspMaster) {
      throw new HttpErrors.BadRequest('Invalid PSP');
    }

    const fields = await this.pspMasterFieldsRepository.find({
      where: {pspMasterId: payload.pspMasterId},
      order: ['order ASC'],
    });

    for (const field of fields) {
      if (
        field.isRequired &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !(payload as Record<string, any>)[field.fieldName]
      ) {
        throw new HttpErrors.BadRequest(`${field.label} is required`);
      }
    }
    const allowedFields = fields.map(f => f.fieldName);

    Object.keys(payload).forEach(key => {
      if (
        ![
          'pspMasterId',
          'settlementAccount',
          'settlementAccountNumber',
          'settlementIfsc',
          'environment',
          'merchantId',
          'merchantAccountId',
          'apiKey',
          'apiSecret',
          'publishableKey',
          'webhookSecret',
        ].includes(key) &&
        !allowedFields.includes(key)
      ) {
        throw new HttpErrors.BadRequest(`Invalid field: ${key}`);
      }
    });

    // ------------------------------------------------
    // CHECK EXISTING PSP
    // ------------------------------------------------

    const existing = await this.pspRepository.findOne(
      {
        where: {
          usersId,
          merchantProfilesId,
          pspMasterId: payload.pspMasterId,
          isDeleted: false,
        },
      },
      {transaction: tx},
    );

    // 🚨 Prevent duplicate PSP creation
    if (existing && existing.id !== pspId) {
      throw new HttpErrors.BadRequest(
        'You cannot create the same PSP again. Please edit the already registered PSP.',
      );
    }

    let psp;

    // ------------------------------------------------
    // UPDATE EXISTING PSP
    // ------------------------------------------------

    if (pspId) {
      const existingPsp = await this.pspRepository.findById(pspId);

      if (!existingPsp) {
        throw new HttpErrors.NotFound('PSP not found');
      }

      if (existingPsp.status === 1) {
        throw new HttpErrors.BadRequest(
          'PSP is already approved! please contact admin',
        );
      }

      await this.pspRepository.updateById(
        pspId,
        {
          ...payload,
          usersId,
          merchantProfilesId,
          status: 0,
          mode: 1,
        },
        {transaction: tx},
      );

      psp = await this.pspRepository.findById(
        pspId,
        {
          include: [
            {
              relation: 'pspMaster',
              scope: {
                include: [{relation: 'pspMasterFields'}],
              },
            },
          ],
        },
        {transaction: tx},
      );
      
      return {
        success: true,
        message: 'Merchant PSP updated',
        psp,
      };
    }

    // ------------------------------------------------
    // CREATE PSP
    // ------------------------------------------------

    psp = await this.pspRepository.create(
      {
        ...payload,
        usersId,
        merchantProfilesId,
        status: 0,
        mode: 1,
        isActive: true,
        isDeleted: false,
      },
      {transaction: tx},
    );

    return {
      success: true,
      message: 'Merchant PSP created',
      psp,
    };
  }

  // update account status
  async updatePspStatus(
    pspId: string,
    status: number,
    reason?: string,
  ): Promise<{success: boolean; message: string}> {
    const existingPsp = await this.pspRepository.findById(pspId);

    if (!existingPsp) {
      throw new HttpErrors.NotFound('No PSP found');
    }

    const statusOptions = [0, 1, 2];

    if (!statusOptions.includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.pspRepository.updateById(existingPsp.id, {
        status: 1,
        verifiedAt: new Date(),
      });
      return {
        success: true,
        message: 'PSP Approved',
      };
    }

    if (status === 2) {
      await this.pspRepository.updateById(existingPsp.id, {
        status: 2,
        reason: reason,
      });
      return {
        success: true,
        message: 'PSP Rejected',
      };
    }

    if (status === 0) {
      await this.pspRepository.updateById(existingPsp.id, {status: 0});
      return {
        success: true,
        message: 'PSP status is under review',
      };
    }

    throw new HttpErrors.BadRequest('invalid status');
  }
}
