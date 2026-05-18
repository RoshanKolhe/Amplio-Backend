import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, FilterExcludingWhere, repository} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {authorize} from '../authorization';
import {BankDetails, PspMaster, Transaction} from '../models';
import {PspMasterRepository, PspRepository, TransactionRepository} from '../repositories';
import {BankDetailsService} from '../services/bank-details.service';

export class PspMasterController {
  constructor(
    @repository(PspMasterRepository)
    public pspMasterRepository: PspMasterRepository,
    @repository('TransactionRepository')
    public transactionRepository: TransactionRepository,
    @repository('PspRepository')
    public pspRepository: PspRepository,
    @inject('service.bankDetails.service')
    private bankDetailsService: BankDetailsService,
  ) { }

  private getTransactionNetAmount(tx: any): number {
    return Number(tx?.netAmount ?? 0);
  }

  private getSettlementStatus(tx: any): string {
    return String(tx?.pspSettlementStatus ?? '').toUpperCase();
  }

  private isSettled(tx: any): boolean {
    return this.getSettlementStatus(tx) === 'SETTLED';
  }

  private isFailed(tx: any): boolean {
    return this.getSettlementStatus(tx) === 'FAILED';
  }

  private isPendingSettlement(tx: any): boolean {
    const status = this.getSettlementStatus(tx);
    return !!status && status !== 'SETTLED' && status !== 'FAILED';
  }

  private parseSettlementDays(settlementMethod?: string | null): number | null {
    if (!settlementMethod) return null;

    const match = settlementMethod.match(/T\+(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  private buildLastSixMonths(): Array<{key: string; label: string}> {
    const now = new Date();
    const months: Array<{key: string; label: string}> = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleString('en-IN', {month: 'short'}),
      });
    }

    return months;
  }

  private buildFinancialSummary(transactions: any[], totalSettlement: number) {
    const now = new Date();

    const monthlyVolume = transactions.reduce((sum, tx) => {
      if (!tx?.createdAt) return sum;

      const createdAt = new Date(tx.createdAt);
      if (Number.isNaN(createdAt.getTime())) return sum;

      if (
        createdAt.getFullYear() === now.getFullYear() &&
        createdAt.getMonth() === now.getMonth()
      ) {
        return sum + this.getTransactionNetAmount(tx);
      }

      return sum;
    }, 0);

    const pendingAmount = transactions.reduce((sum, tx) => {
      return this.isPendingSettlement(tx)
        ? sum + this.getTransactionNetAmount(tx)
        : sum;
    }, 0);

    const failedTransactions = transactions.filter(tx => this.isFailed(tx)).length;

    return {
      monthlyVolume,
      totalSettlements: totalSettlement,
      pendingAmount,
      failedTransactions,
    };
  }

  private buildSettlementTrend(transactions: any[]) {
    const months = this.buildLastSixMonths();
    const monthlyTotals = months.reduce((acc, month) => {
      acc[month.key] = 0;
      return acc;
    }, {} as {[key: string]: number});

    transactions.forEach(tx => {
      if (!tx?.settlementDate || this.isFailed(tx)) return;

      const settlementDate = new Date(tx.settlementDate);
      if (Number.isNaN(settlementDate.getTime())) return;

      const key = `${settlementDate.getFullYear()}-${String(
        settlementDate.getMonth() + 1,
      ).padStart(2, '0')}`;

      if (!(key in monthlyTotals)) return;

      monthlyTotals[key] += this.getTransactionNetAmount(tx);
    });

    return {
      categories: months.map(month => month.label),
      series: [
        {
          name: 'Settlement',
          data: months.map(month => monthlyTotals[month.key] ?? 0),
        },
      ],
    };
  }

  private buildDashboardInclude(includeDetails = false) {
    if (includeDetails) {
      return [
        {
          relation: 'psps',
          scope: {
            fields: {
              id: true,
              merchantProfilesId: true,
              settlementAccount: true,
              settlementAccountNumber: true,
              settlementIfsc: true,
              apiKey: true,
              apiSecret: true,
              publishableKey: true,
              merchantAccountId: true,
              webhookSecret: true,
              environment: true,
              status: true,
              mode: true,
              reason: true,
              verifiedAt: true,
              isActive: true,
              isDeleted: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,
              usersId: true,
              pspMasterId: true,
            },
            include: [
              {
                relation: 'merchantProfiles',
                scope: {
                  fields: {
                    id: true,
                    companyName: true,
                    CIN: true,
                    GSTIN: true,
                    dateOfIncorporation: true,
                    cityOfIncorporation: true,
                    stateOfIncorporation: true,
                    countryOfIncorporation: true,
                    udyamRegistrationNumber: true,
                    merchantLogo: true,
                    merchantAbout: true,
                    isBusinessKycComplete: true,
                    isActive: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true,
                    merchantDealershipTypeId: true,
                    usersId: true,
                    kycApplicationsId: true,
                    deletedAt: true,
                  },
                },
              },
            ],
          },
        },
      ];
    }

    return [
      {
        relation: 'psps',
        scope: {
          fields: {
            id: true,
            merchantProfilesId: true,
            pspMasterId: true,
            updatedAt: true,
          },
        },
      },
    ];
  }

  private async fetchTransactionsForPsps(
    pspIds: string[],
    includeDetails = false,
  ): Promise<any[]> {
    if (!pspIds.length) return [];

    const fields: any = {
      pspId: true,
      netAmount: true,
      pspSettlementStatus: true,
    };

    if (includeDetails) {
      fields.createdAt = true;
      fields.updatedAt = true;
      fields.settlementDate = true;
      fields.settlementMethod = true;
    }

    return this.transactionRepository.find({
      where: {
        pspId: {inq: pspIds},
        isDeleted: false,
      },
      fields,
    });
  }

  private async mapDashboardMaster(master: any, includeDetails = false) {
    const psps = master.psps ?? [];
    const pspIds = psps.map((psp: any) => psp.id).filter(Boolean);
    const transactions = await this.fetchTransactionsForPsps(pspIds, includeDetails);

    const merchantCount = new Set(psps.map((psp: any) => psp.merchantProfilesId)).size;
    const totalTransactions = transactions.length;
    const totalVolume = transactions.reduce(
      (sum: number, tx: any) => sum + this.getTransactionNetAmount(tx),
      0,
    );
    const settledTransactions = transactions.filter((tx: any) => this.isSettled(tx));
    const totalSettlement = settledTransactions.reduce(
      (sum: number, tx: any) => sum + this.getTransactionNetAmount(tx),
      0,
    );
    const activeSettlements = transactions.filter((tx: any) => !this.isSettled(tx)).length;

    const baseRow: any = {
      id: master.id,
      name: master.name,
      value: master.value,
      description: master.description,
      status: master.status,
      merchantCount,
      totalTransactions,
      totalVolume,
      totalSettlement,
      activeSettlements,
    };

    if (!includeDetails) {
      return baseRow;
    }

    const settlementDays = transactions
      .map((tx: any) => this.parseSettlementDays(tx?.settlementMethod))
      .filter((value: number | null): value is number => value !== null);
    const avgSettlementTime = settlementDays.length
      ? `T+${Math.round(
        settlementDays.reduce((sum: number, value: number) => sum + value, 0) /
        settlementDays.length,
      )}`
      : null;
    const lastSyncCandidates = [
      master.updatedAt,
      ...psps.map((psp: any) => psp.updatedAt),
      ...transactions.map((tx: any) => tx.updatedAt),
    ].filter(Boolean) as Date[];
    const lastSync = lastSyncCandidates.length
      ? lastSyncCandidates.reduce((latest, current) =>
        new Date(current) > new Date(latest) ? current : latest,
      )
      : null;

    return {
      ...baseRow,
      statusLabel: master.status === 1 ? 'Active' : 'Inactive',
      avgSettlementTime,
      lastSync,
      financialSummary: this.buildFinancialSummary(transactions, totalSettlement),
      settlementTrend: this.buildSettlementTrend(transactions),
      psps,
    };
  }

  private async buildDashboardData(
    filter?: Filter<PspMaster>,
    includeDetails = false,
  ): Promise<any[]> {
    const finalFilter: Filter<PspMaster> = {
      ...filter,
      include: this.buildDashboardInclude(includeDetails),
    };

    const pspMasters = await this.pspMasterRepository.find(finalFilter);
    return Promise.all(
      pspMasters.map(master => this.mapDashboardMaster(master, includeDetails)),
    );
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/psp-masters')
  @response(200, {
    description: 'PspMaster model instance',
    content: {'application/json': {schema: getModelSchemaRef(PspMaster)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PspMaster, {
            title: 'NewPspMaster',
            exclude: ['id'],
          }),
        },
      },
    })
    pspMaster: Omit<PspMaster, 'id'>,
  ): Promise<PspMaster> {
    return this.pspMasterRepository.create(pspMaster);
  }

  @get('/psp-masters')
  @response(200, {
    description: 'Array of PspMaster model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(PspMaster, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(PspMaster) filter?: Filter<PspMaster>,
  ): Promise<PspMaster[]> {
    const finalFilter: Filter<PspMaster> = {
      ...filter,
      include: [
        {
          relation: 'pspMasterFields',
          scope: {
            order: ['order ASC'],
          },
        },
      ],
    };
    return this.pspMasterRepository.find(finalFilter);
  }

  @get('/psp-masters/{id}')
  @response(200, {
    description: 'PspMaster model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(PspMaster, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(PspMaster, {exclude: 'where'})
    filter?: FilterExcludingWhere<PspMaster>,
  ): Promise<PspMaster> {
    const finalFilter = {
      ...filter,
      include: [
        {
          relation: 'pspMasterFields',
          scope: {
            order: ['order ASC'],
          },
        },
      ],
    };

    return this.pspMasterRepository.findById(id, finalFilter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/psp-masters/{id}')
  @response(204, {
    description: 'PspMaster PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PspMaster, {partial: true}),
        },
      },
    })
    pspMaster: PspMaster,
  ): Promise<void> {
    await this.pspMasterRepository.updateById(id, pspMaster);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/psp-masters/{id}/bank-details')
  @response(200, {
    description: 'Create or update PSP master bank account',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async createBankDetails(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BankDetails, {
            title: 'NewPspMasterBankDetails',
            exclude: [
              'id',
              'usersId',
              'roleValue',
              'pspMasterId',
              'status',
              'mode',
              'isActive',
              'isDeleted',
            ],
          }),
        },
      },
    })
    bankDetails: Omit<BankDetails, 'id' | 'usersId' | 'roleValue' | 'pspMasterId'>,
  ): Promise<{success: boolean; message: string; account: BankDetails}> {
    await this.pspMasterRepository.findById(id);

    return this.bankDetailsService.createOrUpdatePspMasterBankAccount(
      id,
      new BankDetails({
        ...bankDetails,
        pspMasterId: id,
        roleValue: 'psp_master',
        status: bankDetails.status ?? 1,
        mode: bankDetails.mode ?? 1,
        isActive: bankDetails.isActive ?? true,
        isDeleted: bankDetails.isDeleted ?? false,
      }) as Omit<BankDetails, 'id'>,
    );
  }

  @get('/psp-masters/{id}/bank-details')
  @response(200, {
    description: 'Fetch PSP master bank accounts',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async fetchBankDetails(
    @param.path.string('id') id: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails[]}> {
    await this.pspMasterRepository.findById(id);

    const bankDetails = await this.pspMasterRepository.bankDetails(id).find({
      where: {
        isActive: true,
        isDeleted: false,
      },
      include: [
        {
          relation: 'bankAccountProof',
          scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}},
        },
      ],
    });

    return {
      success: true,
      message: 'PSP master bank accounts',
      bankDetails,
    };
  }

  @get('/psp-masters/{id}/bank-details/{accountId}')
  @response(200, {
    description: 'Fetch PSP master bank account by id',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async fetchBankDetailsById(
    @param.path.string('id') id: string,
    @param.path.string('accountId') accountId: string,
  ): Promise<{success: boolean; message: string; bankDetails: BankDetails}> {
    await this.pspMasterRepository.findById(id);

    const result = await this.bankDetailsService.fetchUserBankAccount(accountId, {
      pspMasterId: id,
    });

    return {
      ...result,
      bankDetails: result.account,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/psp-masters/{id}/bank-details/{accountId}')
  @response(200, {
    description: 'Update PSP master bank account',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async updateBankDetailsById(
    @param.path.string('id') id: string,
    @param.path.string('accountId') accountId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BankDetails, {
            partial: true,
            exclude: ['id', 'usersId', 'roleValue', 'pspMasterId'],
          }),
        },
      },
    })
    accountData: Partial<BankDetails>,
  ): Promise<{success: boolean; message: string; account: BankDetails | null}> {
    await this.pspMasterRepository.findById(id);

    const result = await this.bankDetailsService.updateBankAccountInfo(
      accountId,
      new BankDetails({
        ...accountData,
        pspMasterId: id,
      }),
      undefined,
      {pspMasterId: id},
    );

    if (!result.account) {
      throw new HttpErrors.NotFound('Bank account not found');
    }

    return result;
  }


  @get('/psp-masters/admin-dashboard')
  @response(200, {
    description: 'Array of PSP dashboard data',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {type: 'string'},
              name: {type: 'string'},
              value: {type: 'string'},
              description: {type: 'string'},
              status: {type: 'number'},

              merchantCount: {type: 'number'},
              totalTransactions: {type: 'number'},
              totalVolume: {type: 'number'},
              totalSettlement: {type: 'number'},
            },
          },
        },
      },
    },
  })
  async data(
    @param.filter(PspMaster) filter?: Filter<PspMaster>,
  ): Promise<any[]> {
    return this.buildDashboardData(filter, false);
  }


  @get('/psp-masters/admin-dashboard/{id}')
  @response(200, {
    description: 'PSP dashboard by id',
    content: {
      'application/json': {
        schema: {
          type: 'object',
        },
      },
    },
  })
  async dataById(
    @param.path.string('id') id: string,
  ): Promise<any> {
    const results = await this.buildDashboardData({
      where: {
        id,
        isDeleted: false,
      },
    }, true);

    return results[0] ?? null;
  }

  @get('/psp-master/transactions/{masterId}')
  @response(200, {
    description: 'Transactions by PSP Master ID',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
            },

            rows: {
              type: 'array',
            },
          },
        },
      },
    },
  })
  async trannsactionById(
    @param.path.string('masterId') masterId: string,

    @param.query.number('limit') limit = 10,

    @param.query.number('skip') skip = 0,

  ): Promise<{
    count: number;
    rows: Transaction[];
  }> {

    const psps = await this.pspRepository.find({
      where: {
        pspMasterId: masterId,
        isDeleted: false,
      },

      fields: {
        id: true,
      },
    });

    const pspIds = psps.map(psp => psp.id);

    if (pspIds.length === 0) {
      return {
        count: 0,
        rows: [],
      };
    }

    const where: any = {
      pspId: {
        inq: pspIds,
      },

      isDeleted: false,
    };


    const countResult =
      await this.transactionRepository.count(where);

    const rows = await this.transactionRepository.find({
      where,

      limit,
      skip,

      order: ['createdAt DESC'],

      include: [
        {
          relation: 'psp',
          scope: {
            fields: {
              id: true,
              merchantProfilesId: true,
              pspMasterId: true,
            },
          },
        },
      ],
    });

    return {
      count: countResult.count,
      rows,
    };
  }
}
