import {inject} from '@loopback/core';
import {IsolationLevel, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {AmplioDataSource} from '../datasources';
import {
  InvestorProfile,
  PoolFinancials,
  PtcIssuance,
  PtcParameters,
  Spv,
} from '../models';
import {
  EscrowSetupRepository,
  InvestorProfileRepository,
  InvestorPtcHoldingRepository,
  PoolFinancialsRepository,
  PtcIssuanceRepository,
  PtcParametersRepository,
  SpvRepository,
  TransactionRepository,
} from '../repositories';

export type PtcInventorySummary = {
  totalUnits: number;
  soldUnits: number;
  availableUnits: number;
  maxUnitsPerInvestor: number;
  alreadyOwnedUnits: number;
  investorRemainingLimit: number;
  unitPrice: number;
  soldPercentage: number;
  poolEscrowSetupId: string | null;
};

export class PtcIssuanceService {
  constructor(
    @inject('datasources.amplio')
    private datasource: AmplioDataSource,
    @repository(PtcIssuanceRepository)
    private ptcIssuanceRepository: PtcIssuanceRepository,
    @repository(InvestorPtcHoldingRepository)
    private investorPtcHoldingRepository: InvestorPtcHoldingRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(PoolFinancialsRepository)
    private poolFinancialsRepository: PoolFinancialsRepository,
    @repository(PtcParametersRepository)
    private ptcParametersRepository: PtcParametersRepository,
    @repository(EscrowSetupRepository)
    private escrowSetupRepository: EscrowSetupRepository,
  ) {}

  private normalizeAmount(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(2));
  }

  private getOptions(tx?: unknown) {
    return tx ? {transaction: tx} : undefined;
  }

  private async fetchSpvOrFail(spvId: string, tx?: unknown): Promise<Spv> {
    return this.spvRepository.findById(spvId, undefined, this.getOptions(tx));
  }

  private async fetchPoolForSpvOrFail(
    spvId: string,
    tx?: unknown,
  ): Promise<PoolFinancials> {
    const runtimePool = await this.poolFinancialsRepository.findOne(
      {
        where: {
          and: [{spvId}, {isActive: true}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    if (runtimePool) {
      return runtimePool;
    }

    const spv = await this.fetchSpvOrFail(spvId, tx);
    const applicationPool = await this.poolFinancialsRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId: spv.spvApplicationId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      },
      this.getOptions(tx),
    );

    if (!applicationPool) {
      throw new HttpErrors.NotFound('Pool financials not found for the SPV');
    }

    if (!applicationPool.spvId) {
      await this.poolFinancialsRepository.updateById(
        applicationPool.id,
        {spvId},
        this.getOptions(tx),
      );

      return this.poolFinancialsRepository.findById(
        applicationPool.id,
        undefined,
        this.getOptions(tx),
      );
    }

    return applicationPool;
  }

  private async fetchPtcParametersForSpvOrFail(
    spv: Spv,
    tx?: unknown,
  ): Promise<PtcParameters> {
    const ptcParameters = await this.ptcParametersRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId: spv.spvApplicationId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      },
      this.getOptions(tx),
    );

    if (!ptcParameters) {
      throw new HttpErrors.NotFound('PTC parameters not found for the SPV');
    }

    return ptcParameters;
  }

  private async resolvePoolEscrowSetupId(
    pool: PoolFinancials,
    spvApplicationId: string,
    tx?: unknown,
  ): Promise<string | null> {
    if (pool.escrowSetupId) {
      return pool.escrowSetupId;
    }

    const escrowSetup = await this.escrowSetupRepository.findOne(
      {
        where: {
          and: [
            {spvApplicationId},
            {accountType: 'collection_escrow'},
            {isActive: true},
            {isDeleted: false},
          ],
        },
        order: ['createdAt ASC'],
      },
      this.getOptions(tx),
    );

    if (!escrowSetup) {
      return null;
    }

    await this.poolFinancialsRepository.updateById(
      pool.id,
      {escrowSetupId: escrowSetup.id},
      this.getOptions(tx),
    );

    return escrowSetup.id;
  }

  private async fetchInvestorProfileOrFail(
    usersId: string,
    tx?: unknown,
  ): Promise<InvestorProfile> {
    const investorProfile = await this.investorProfileRepository.findOne(
      {
        where: {
          and: [{usersId}, {isActive: true}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Active investor profile not found');
    }

    return investorProfile;
  }

  private async fetchInvestorOwnedUnits(
    investorProfileId: string,
    spvId: string,
    tx?: unknown,
  ): Promise<number> {
    const holdings = await this.investorPtcHoldingRepository.find(
      {
        where: {
          and: [{investorProfileId}, {spvId}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    return holdings.reduce(
      (sum, holding) => sum + Number(holding.ownedUnits ?? 0),
      0,
    );
  }

  async ensureIssuanceForPoolTransaction(
    transactionId: string,
    spvId: string,
    tx?: unknown,
  ): Promise<{created: boolean; issuance: PtcIssuance | null; reason?: string}> {
    const existingIssuance = await this.ptcIssuanceRepository.findOne(
      {
        where: {
          and: [{transactionId}, {isDeleted: false}],
        },
      },
      this.getOptions(tx),
    );

    if (existingIssuance) {
      return {
        created: false,
        issuance: existingIssuance,
        reason: 'PTC issuance already exists for this transaction',
      };
    }

    const transaction = await this.transactionRepository.findById(
      transactionId,
      undefined,
      this.getOptions(tx),
    );

    if (!transaction.spvId || transaction.spvId !== spvId) {
      throw new HttpErrors.BadRequest('Transaction does not belong to the supplied SPV');
    }

    const spv = await this.fetchSpvOrFail(spvId, tx);
    const pool = await this.fetchPoolForSpvOrFail(spvId, tx);
    let ptcParameters: PtcParameters;

    try {
      ptcParameters = await this.fetchPtcParametersForSpvOrFail(spv, tx);
    } catch (error) {
      if (error instanceof HttpErrors.NotFound) {
        return {
          created: false,
          issuance: null,
          reason: 'PTC parameters are not configured for this SPV',
        };
      }

      throw error;
    }
    const unitPrice = Number(ptcParameters.faceValuePerUnit ?? 0);

    if (unitPrice <= 0) {
      return {
        created: false,
        issuance: null,
        reason: 'PTC face value is not configured',
      };
    }

    const totalUnits = Math.floor(Number(transaction.amount ?? 0) / unitPrice);

    if (totalUnits <= 0) {
      return {
        created: false,
        issuance: null,
        reason: 'Transaction amount is below the PTC unit price',
      };
    }

    const issuance = await this.ptcIssuanceRepository.create(
      {
        id: uuidv4(),
        spvId,
        poolFinancialsId: pool.id,
        transactionId: transaction.id,
        unitPrice: this.normalizeAmount(unitPrice),
        issuedAmount: this.normalizeAmount(totalUnits * unitPrice),
        totalUnits,
        soldUnits: 0,
        remainingUnits: totalUnits,
        status: 'ACTIVE',
        isActive: true,
        isDeleted: false,
      },
      this.getOptions(tx),
    );

    return {
      created: true,
      issuance,
    };
  }

  async fetchInventoryForSpv(
    spvId: string,
    usersId?: string,
    tx?: unknown,
  ): Promise<PtcInventorySummary> {
    const spv = await this.fetchSpvOrFail(spvId, tx);
    const pool = await this.fetchPoolForSpvOrFail(spvId, tx);
    const ptcParameters = await this.fetchPtcParametersForSpvOrFail(spv, tx);
    const issuances = await this.ptcIssuanceRepository.find(
      {
        where: {
          and: [{spvId}, {poolFinancialsId: pool.id}, {isDeleted: false}],
        },
        order: ['createdAt ASC'],
      },
      this.getOptions(tx),
    );

    const totalUnits = issuances.reduce(
      (sum, issuance) => sum + Number(issuance.totalUnits ?? 0),
      0,
    );
    const soldUnits = issuances.reduce(
      (sum, issuance) => sum + Number(issuance.soldUnits ?? 0),
      0,
    );
    const availableUnits = issuances.reduce(
      (sum, issuance) => sum + Number(issuance.remainingUnits ?? 0),
      0,
    );
    const maxUnitsPerInvestor = Number(ptcParameters.maxUnitsPerInvestor ?? 0);
    const investorProfile = usersId
      ? await this.fetchInvestorProfileOrFail(usersId, tx)
      : null;
    const alreadyOwnedUnits = investorProfile
      ? await this.fetchInvestorOwnedUnits(investorProfile.id, spvId, tx)
      : 0;
    const investorRemainingLimit =
      maxUnitsPerInvestor > 0
        ? Math.max(maxUnitsPerInvestor - alreadyOwnedUnits, 0)
        : availableUnits;
    const poolEscrowSetupId = await this.resolvePoolEscrowSetupId(
      pool,
      spv.spvApplicationId,
      tx,
    );
    const unitPrice = this.normalizeAmount(
      Number(issuances[0]?.unitPrice ?? ptcParameters.faceValuePerUnit ?? 0),
    );

    return {
      totalUnits,
      soldUnits,
      availableUnits,
      maxUnitsPerInvestor,
      alreadyOwnedUnits,
      investorRemainingLimit,
      unitPrice,
      soldPercentage: totalUnits
        ? this.normalizeAmount((soldUnits / totalUnits) * 100)
        : 0,
      poolEscrowSetupId,
    };
  }

  private async lockInvestorInventoryRows(
    investorProfileId: string,
    spvId: string,
    issuanceIds: string[],
    tx: unknown,
  ): Promise<void> {
    await this.datasource.execute(
      `SELECT id FROM public.investor_ptc_holdings
       WHERE investorprofileid = $1
         AND spvid = $2
         AND isdeleted = false
       FOR UPDATE`,
      [investorProfileId, spvId],
      this.getOptions(tx),
    );

    if (!issuanceIds.length) {
      return;
    }

    await this.datasource.execute(
      `SELECT id FROM public.ptc_issuances
       WHERE id = ANY($1::uuid[])
       FOR UPDATE`,
      [issuanceIds],
      this.getOptions(tx),
    );
  }

  async buyUnits(
    currentUser: UserProfile,
    spvId: string,
    requestedUnits: number,
  ): Promise<{
    spvId: string;
    requestedUnits: number;
    allocatedUnits: number;
    partialAllocation: boolean;
    totalInvestment: number;
    totalUnits: number;
    soldUnits: number;
    availableUnits: number;
    maxUnitsPerInvestor: number;
    investorRemainingLimit: number;
    poolEscrowSetupId: string | null;
  }> {
    const normalizedRequestedUnits = Math.floor(Number(requestedUnits ?? 0));

    if (normalizedRequestedUnits <= 0) {
      throw new HttpErrors.BadRequest('Requested units must be greater than zero');
    }

    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const investorProfile = await this.fetchInvestorProfileOrFail(currentUser.id, tx);
      const pool = await this.fetchPoolForSpvOrFail(spvId, tx);
      const inventoryBeforeBuy = await this.fetchInventoryForSpv(
        spvId,
        currentUser.id,
        tx,
      );

      if (!inventoryBeforeBuy.poolEscrowSetupId) {
        throw new HttpErrors.BadRequest('Pool escrow account is not configured');
      }

      const issuances = await this.ptcIssuanceRepository.find(
        {
          where: {
            and: [
              {spvId},
              {poolFinancialsId: pool.id},
              {isDeleted: false},
              {isActive: true},
            ],
          },
          order: ['createdAt ASC'],
        },
        this.getOptions(tx),
      );

      await this.lockInvestorInventoryRows(
        investorProfile.id,
        spvId,
        issuances.map(issuance => issuance.id),
        tx,
      );

      const lockedIssuances = await this.ptcIssuanceRepository.find(
        {
          where: {
            and: [
              {spvId},
              {poolFinancialsId: pool.id},
              {isDeleted: false},
              {isActive: true},
            ],
          },
          order: ['createdAt ASC'],
        },
        this.getOptions(tx),
      );

      const alreadyOwnedUnits = await this.fetchInvestorOwnedUnits(
        investorProfile.id,
        spvId,
        tx,
      );
      const totalAvailableUnits = lockedIssuances.reduce(
        (sum, issuance) => sum + Number(issuance.remainingUnits ?? 0),
        0,
      );
      const investorRemainingLimit =
        inventoryBeforeBuy.maxUnitsPerInvestor > 0
          ? Math.max(
              inventoryBeforeBuy.maxUnitsPerInvestor - alreadyOwnedUnits,
              0,
            )
          : totalAvailableUnits;
      const allowedUnits = Math.min(
        normalizedRequestedUnits,
        totalAvailableUnits,
        investorRemainingLimit,
      );

      if (allowedUnits <= 0) {
        throw new HttpErrors.BadRequest('Units not available');
      }

      let unitsToAllocate = allowedUnits;
      let totalInvestment = 0;

      for (const issuance of lockedIssuances) {
        if (unitsToAllocate <= 0) {
          break;
        }

        const availableInIssuance = Number(issuance.remainingUnits ?? 0);

        if (availableInIssuance <= 0) {
          continue;
        }

        const allocatedUnits = Math.min(unitsToAllocate, availableInIssuance);
        const nextSoldUnits = Number(issuance.soldUnits ?? 0) + allocatedUnits;
        const nextRemainingUnits = availableInIssuance - allocatedUnits;

        await this.ptcIssuanceRepository.updateById(
          issuance.id,
          {
            soldUnits: nextSoldUnits,
            remainingUnits: nextRemainingUnits,
            status: nextRemainingUnits === 0 ? 'SOLD_OUT' : 'ACTIVE',
          },
          this.getOptions(tx),
        );

        const holding = await this.investorPtcHoldingRepository.findOne(
          {
            where: {
              and: [
                {ptcIssuanceId: issuance.id},
                {investorProfileId: investorProfile.id},
                {isDeleted: false},
              ],
            },
          },
          this.getOptions(tx),
        );
        const investedAmount = this.normalizeAmount(
          allocatedUnits * Number(issuance.unitPrice ?? 0),
        );

        if (holding) {
          await this.investorPtcHoldingRepository.updateById(
            holding.id,
            {
              ownedUnits: Number(holding.ownedUnits ?? 0) + allocatedUnits,
              investedAmount: this.normalizeAmount(
                Number(holding.investedAmount ?? 0) + investedAmount,
              ),
            },
            this.getOptions(tx),
          );
        } else {
          await this.investorPtcHoldingRepository.create(
            {
              id: uuidv4(),
              ptcIssuanceId: issuance.id,
              investorProfileId: investorProfile.id,
              usersId: currentUser.id,
              spvId,
              poolFinancialsId: pool.id,
              ownedUnits: allocatedUnits,
              investedAmount,
              isActive: true,
              isDeleted: false,
            },
            this.getOptions(tx),
          );
        }

        totalInvestment = this.normalizeAmount(totalInvestment + investedAmount);
        unitsToAllocate -= allocatedUnits;
      }

      await tx.commit();

      const inventoryAfterBuy = await this.fetchInventoryForSpv(spvId, currentUser.id);

      return {
        spvId,
        requestedUnits: normalizedRequestedUnits,
        allocatedUnits: allowedUnits,
        partialAllocation: allowedUnits < normalizedRequestedUnits,
        totalInvestment,
        totalUnits: inventoryAfterBuy.totalUnits,
        soldUnits: inventoryAfterBuy.soldUnits,
        availableUnits: inventoryAfterBuy.availableUnits,
        maxUnitsPerInvestor: inventoryAfterBuy.maxUnitsPerInvestor,
        investorRemainingLimit: inventoryAfterBuy.investorRemainingLimit,
        poolEscrowSetupId: inventoryAfterBuy.poolEscrowSetupId,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
