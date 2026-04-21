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

    const trimmedValue = value.trim();
    return trimmedValue.length ? trimmedValue : undefined;
  }

  private async ensureUniqueCredentials(
    payload: Partial<Psp>,
    pspId?: string,
    tx?: unknown,
  ) {
    const duplicateChecks = [
      {
        field: 'apiKey' as const,
        value: this.normalizeCredentialValue(payload.apiKey),
        message: 'This apiKey is already used in another PSP.',
      },
      {
        field: 'apiSecret' as const,
        value: this.normalizeCredentialValue(payload.apiSecret),
        message: 'This apiSecret is already used in another PSP.',
      },
    ];

    for (const check of duplicateChecks) {
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

  private handleDuplicateCredentialError(error: unknown): never {
    const dbError = error as {
      code?: string;
      detail?: string;
      message?: string;
    };

    if (dbError?.code === '23505') {
      const errorText = `${dbError.detail ?? ''} ${dbError.message ?? ''}`;

      if (errorText.includes('apiKey')) {
        throw new HttpErrors.BadRequest(
          'This apiKey is already used in another PSP.',
        );
      }

      if (errorText.includes('apiSecret')) {
        throw new HttpErrors.BadRequest(
          'This apiSecret is already used in another PSP.',
        );
      }
    }

    throw error;
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

  private async fetchPspWithRelations(pspId: string, tx?: unknown) {
    return this.pspRepository.findById(
      pspId,
      {
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
      },
      tx ? {transaction: tx} : undefined,
    );
  }

  async upsertMerchantPsp(
    merchantProfilesId: string,
    usersId: string,
    payload: Partial<Psp>,
    pspId: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ) {
    payload.apiKey = this.normalizeCredentialValue(payload.apiKey);
    payload.apiSecret = this.normalizeCredentialValue(payload.apiSecret);

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

    await this.ensureUniqueCredentials(payload, pspId, tx);

    let psp;

    // ------------------------------------------------
    // UPDATE EXISTING PSP
    // ------------------------------------------------

    if (pspId) {
      const existingPsp = await this.pspRepository.findOne(
        {
          where: {
            id: pspId,
            usersId,
            merchantProfilesId,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      if (!existingPsp) {
        throw new HttpErrors.NotFound('PSP not found');
      }

      if (existingPsp.status === 1) {
        throw new HttpErrors.BadRequest(
          'PSP is already approved! please contact admin',
        );
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
          {transaction: tx},
        );
      } catch (error) {
        this.handleDuplicateCredentialError(error);
      }

      psp = await this.fetchPspWithRelations(pspId, tx);

      return {
        success: true,
        message: 'Merchant PSP updated',
        psp,
      };
    }

    // ------------------------------------------------
    // CREATE PSP
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
        {transaction: tx},
      );
    } catch (error) {
      this.handleDuplicateCredentialError(error);
    }

    psp = await this.fetchPspWithRelations(psp.id, tx);

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




  private async getPspProviderValue(psp: Psp & {pspMaster?: {value?: string}}) {
    if (psp.pspMaster?.value) {
      return psp.pspMaster.value.toLowerCase();
    }

    const pspMaster = await this.pspMasterRepository.findById(psp.pspMasterId);
    return pspMaster.value.toLowerCase();
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

    const payments: Record<string, unknown>[] = [];
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
              skip,
            },
            timeout: 60000,
          },
        );


        const items = Array.isArray(response.data.items)
          ? response.data.items
          : [];

        payments.push(...items);

        if (items.length < pageSize) {
          break;
        }

        skip += pageSize;
      }
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'isAxiosError' in error &&
        (error as {isAxiosError?: boolean}).isAxiosError
      ) {
        const axiosError = error as {
          code?: string;
          message?: string;
          response?: {
            status?: number;
            data?: unknown;
          };
        };
        const status = axiosError.response?.status;
        const responseData = axiosError.response?.data;
        const razorpayMessage =
          responseData &&
          typeof responseData === 'object' &&
          'error' in responseData &&
          typeof responseData.error === 'object' &&
          responseData.error &&
          'description' in responseData.error
            ? String(responseData.error.description)
            : undefined;

        // console.error('Razorpay fetch failed', {
        //   pspId: psp.id,
        //   status,
        //   code: axiosError.code,
        //   message: axiosError.message,
        //   responseData,
        // });

        if (status === 401) {
          throw new HttpErrors.Unauthorized(
            `Razorpay authentication failed for PSP ${psp.id}. Please verify that the saved apiKey/apiSecret are the actual Razorpay key_id and key_secret from the Razorpay dashboard.${razorpayMessage ? ` Razorpay says: ${razorpayMessage}` : ''}`,
          );
        }

        throw new HttpErrors.BadGateway(
          `Failed to fetch Razorpay payments for PSP ${psp.id}.${status ? ` Status: ${status}.` : ''}${razorpayMessage ? ` Razorpay says: ${razorpayMessage}` : ''}`,
        );
      }

      throw error;
    }

    return payments;
  }

}

