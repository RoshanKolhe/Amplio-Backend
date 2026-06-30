import {BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import axios from 'axios';
import {Psp} from '../models';
import {
  PspMasterFieldsRepository,
  PspMasterRepository,
  PspRepository,
} from '../repositories';

type RazorpayPaymentsResponse = {
  items?: Record<string, unknown>[];
};

@injectable({scope: BindingScope.TRANSIENT})
export class PspService {
  constructor(
    @repository(PspRepository)
    public pspRepository: PspRepository,
    @repository(PspMasterRepository)
    public pspMasterRepository: PspMasterRepository,
    @repository(PspMasterFieldsRepository)
    public pspMasterFieldsRepository: PspMasterFieldsRepository,
  ) { }


  private normalizeCredentialValue(value?: string) {
    if (typeof value !== 'string') {
      return value;
    }
    return value.trim();
  }

  private async ensureUniqueCredentials(
    payload: Partial<Psp>,
    pspId?: string,
    tx?: unknown,
  ) {
    const checks = [
      {
        field: 'apiKey',
        value: this.normalizeCredentialValue(payload.apiKey),
        message: 'API Key already in use by another merchant',
      },
      {
        field: 'apiSecret',
        value: this.normalizeCredentialValue(payload.apiSecret),
        message: 'API Secret already in use by another merchant',
      },
    ];

    for (const check of checks) {
      if (!check.value) {
        continue;
      }

      const duplicatePsp = await this.pspRepository.findOne(
        {
          where: {
            [check.field]: check.value,
          },
        },
        tx ? {transaction: tx} : undefined,
      );

      if (duplicatePsp && duplicatePsp.id !== pspId) {
        throw new HttpErrors.BadRequest(check.message);
      }
    }
  }

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
            fields: {id: true, name: true, value: true},
          },
        },
      ],
    });

    if (!psp || psp.length === 0) {
      return {
        success: false,
        message: 'Merchant PSP not found',
        psp: [],
      };
    }

    return {
      success: true,
      message: 'Merchant PSP fetched',
      psp,
    };
  }

  async fetchMerchantPspByProfile(merchantProfilesId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const psp: any[] = await this.pspRepository.find({
      where: {
        merchantProfilesId,
        isActive: true,
        isDeleted: false,
      },
      include: [
        {
          relation: 'pspMaster',
          scope: {
            fields: {id: true, name: true, value: true},
          },
        },
      ],
    });

    if (!psp || psp.length === 0) {
      return {
        success: false,
        message: 'Merchant PSP not found',
        psp: [],
      };
    }

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
    pspId?: string,
    tx?: any,
  ) {
    // Validate that merchant exists and is linked to the user
    // (This check is typically done in the controller or via a join)

    // Check for existing duplicates
    await this.ensureUniqueCredentials(payload, pspId, tx);

    let psp;

    // ------------------------------------------------
    // UPDATE EXISTING PSP
    // ------------------------------------------------
    if (pspId) {
      psp = await this.pspRepository.findOne(
        {
          where: {
            id: pspId,
            usersId,
            merchantProfilesId,
            isDeleted: false,
          },
        },
        tx ? {transaction: tx} : undefined,
      );

      if (!psp) {
        throw new HttpErrors.NotFound('PSP not found or access denied');
      }

      try {
        await this.pspRepository.updateById(
          pspId,
          {
            ...payload,
            usersId,
            merchantProfilesId,
            status: 0,
            mode: 1,
          },
          tx ? {transaction: tx} : undefined,
        );

        psp = await this.pspRepository.findById(pspId, undefined, tx ? {transaction: tx} : undefined);
      } catch (error) {
        throw error;
      }

      return {
        success: true,
        message: 'Merchant PSP updated',
        psp,
      };
    }

    // ------------------------------------------------
    // CREATE NEW PSP
    // ------------------------------------------------
    try {
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
        tx ? {transaction: tx} : undefined,
      );
    } catch (error) {
      throw error;
    }

    return {
      success: true,
      message: 'Merchant PSP created',
      psp,
    };
  }

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
        reason,
      });
      return {
        success: true,
        message: 'PSP Rejected',
      };
    }

    await this.pspRepository.updateById(existingPsp.id, {status: 0});
    return {
      success: true,
      message: 'PSP status is under review',
    };
  }

  async getPspProviderValue(psp: Psp & {pspMaster?: {value?: string}}) {
    if (psp.pspMaster?.value) {
      return psp.pspMaster.value;
    }

    const master = await this.pspMasterRepository.findById(psp.pspMasterId);
    return master.value;
  }

  async fetchTransactions(
    psp: Psp & {pspMaster?: {value?: string}},
  ): Promise<Record<string, unknown>[]> {
    const provider = await this.getPspProviderValue(psp);

    if (provider !== 'razorpay') {
      return [];
    }

    if (!psp.apiKey || !psp.apiSecret) {
      throw new HttpErrors.BadRequest(
        `API credentials are missing for PSP ${psp.id}`,
      );
    }

    const pageSize = 100;
    let skip = 0;

    try {
      while (true) {
        const response = await axios.get<RazorpayPaymentsResponse>(
          'https://api.razorpay.com/v1/payments',
          {
            auth: {
              username: psp.apiKey,
              password: psp.apiSecret,
            },
            params: {
              count: pageSize,
              skip: skip,
            },
          },
        );

        const items = response.data.items || [];
        if (items.length === 0) {
          break;
        }

        return items; // For now return first page or implement full fetch
      }
    } catch (error) {
      // console.error('Error fetching Razorpay transactions:', error);
      throw new HttpErrors.InternalServerError(
        'Failed to fetch transactions from payment provider',
      );
    }

    return [];
  }
}
