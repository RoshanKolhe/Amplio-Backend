import {MetadataInspector} from '@loopback/metadata';
import {HttpErrors} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import {expect, sinon} from '@loopback/testlab';
import {WalletWithdrawalController} from '../../controllers/wallet-withdrawal.controller';
import {
  InvestorEscrowLedgerStatus,
  InvestorEscrowLedgerType,
  WithdrawalRequestStatus,
} from '../../models';
import {InvestorPtcHolding} from '../../models/investor-ptc-holding.model';
import {InvestorInvestmentsService} from '../../services/investor-investments.service';
import {PtcIssuanceService} from '../../services/ptc-issuance.service';
import {WalletWithdrawalService} from '../../services/wallet-withdrawal.service';

describe('Investor PTC buy and wallet hardening', () => {
  const investorUser = {
    [securityId]: '11111111-1111-4111-8111-111111111111',
    id: '11111111-1111-4111-8111-111111111111',
    roles: ['investor'],
  } as unknown as UserProfile;
  const otherInvestorUser = {
    [securityId]: '22222222-2222-4222-8222-222222222222',
    id: '22222222-2222-4222-8222-222222222222',
    roles: ['investor'],
  } as unknown as UserProfile;

  function createPtcServiceFixture(options?: {
    currentBalance?: number;
    blockedBalance?: number;
    remainingUnits?: number;
    holdings?: Array<Record<string, unknown>>;
    closedInvestments?: Array<Record<string, unknown>>;
  }) {
    const tx = {
      commit: sinon.stub().resolves(),
      rollback: sinon.stub().resolves(),
    };
    const wallet = {
      id: '22222222-2222-4222-8222-222222222222',
      investorProfileId: '33333333-3333-4333-8333-333333333333',
      currentBalance: options?.currentBalance ?? 1000,
      blockedBalance: options?.blockedBalance ?? 0,
      isActive: true,
      isDeleted: false,
    };
    const issuances = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        spvId: '55555555-5555-4555-8555-555555555555',
        poolFinancialsId: '66666666-6666-4666-8666-666666666666',
        unitPrice: 100,
        totalUnits: options?.remainingUnits ?? 10,
        soldUnits: 0,
        remainingUnits: options?.remainingUnits ?? 10,
        isActive: true,
        isDeleted: false,
      },
    ];
    const holdings: Array<Record<string, unknown>> = options?.holdings ?? [];
    const ledgers: Array<Record<string, unknown>> = [];
    const closedInvestments: Array<Record<string, unknown>> =
      options?.closedInvestments ?? [];
    const datasource = {
      beginTransaction: sinon.stub().resolves(tx),
      execute: sinon.stub().callsFake((sql: string, params?: unknown[]) => {
        const normalizedSql = String(sql).toLowerCase();

        if (
          normalizedSql.includes('from public.investor_escrow_ledgers') &&
          normalizedSql.includes('metadata->>\'spvid\' = $4')
        ) {
          const investorId = String(params?.[0] ?? '');
          const type = String(params?.[1] ?? '');
          const status = String(params?.[2] ?? '');
          const spvId = String(params?.[3] ?? '');

          return Promise.resolve(
            ledgers
              .filter(ledger => {
                if (String(ledger.investorId ?? '') !== investorId) {
                  return false;
                }
                if (String(ledger.type ?? '') !== type) {
                  return false;
                }
                if (String(ledger.status ?? '') !== status) {
                  return false;
                }
                if (ledger.isDeleted !== false) {
                  return false;
                }

                const metadata =
                  ledger.metadata && typeof ledger.metadata === 'object'
                    ? (ledger.metadata as Record<string, unknown>)
                    : {};

                return String(metadata.spvId ?? '') === spvId;
              })
              .map(ledger => ({
                id: ledger.id,
                amount: ledger.amount,
                createdat: ledger.createdAt ?? new Date(),
                metadata: ledger.metadata ?? {},
              })),
          );
        }

        return Promise.resolve([]);
      }),
    };
    const ptcIssuanceRepository = {
      find: sinon.stub().resolves(issuances),
      updateById: sinon.stub().callsFake((id: string, data: object) => {
        Object.assign(issuances.find(issuance => issuance.id === id)!, data);
      }),
    };
    const investorPtcHoldingRepository = {
      find: sinon.stub().resolves(holdings),
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const ptcCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'ptcIssuanceId'),
        ) as {ptcIssuanceId?: string};
        return Promise.resolve(
          holdings.find(
            holding =>
              holding.ptcIssuanceId === ptcCondition?.ptcIssuanceId &&
              holding.isDeleted === false,
          ) ?? null,
        );
      }),
      create: sinon.stub().callsFake((data: object) => {
        holdings.push(data as Record<string, unknown>);
        return Promise.resolve(data);
      }),
      updateById: sinon.stub().callsFake((id: string, data: object) => {
        const holding = holdings.find(row => row.id === id);
        if (holding) {
          Object.assign(holding, data);
        }
        return Promise.resolve();
      }),
    };
    const investorEscrowAccountRepository = {
      findOne: sinon.stub().resolves(wallet),
      updateById: sinon.stub().callsFake((_id: string, data: object) => {
        Object.assign(wallet, data);
      }),
    };
    const investorEscrowLedgerRepository = {
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const referenceIdCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'referenceId'),
        ) as {referenceId?: string};
        return Promise.resolve(
          ledgers.find(
            ledger => ledger.referenceId === referenceIdCondition?.referenceId,
          ) ?? null,
        );
      }),
      create: sinon.stub().callsFake((data: object) => {
        const row = {
          ...(data as Record<string, unknown>),
          createdAt:
            (data as {createdAt?: Date}).createdAt ??
            new Date('2026-04-01T00:00:00.000Z'),
        };
        ledgers.push(row);
        return Promise.resolve(row);
      }),
    };
    const investorProfileRepository = {
      findOne: sinon.stub().resolves({
        id: '33333333-3333-4333-8333-333333333333',
        usersId: investorUser.id,
      }),
      findById: sinon.stub().resolves({
        id: '33333333-3333-4333-8333-333333333333',
        usersId: investorUser.id,
      }),
    };
    const transactionRepository = {};
    const spvRepository = {
      findById: sinon.stub().resolves({
        id: '55555555-5555-4555-8555-555555555555',
        spvApplicationId: '77777777-7777-4777-8777-777777777777',
      }),
    };
    const poolFinancialsRepository = {
      findOne: sinon.stub().resolves({
        id: '66666666-6666-4666-8666-666666666666',
        spvId: '55555555-5555-4555-8555-555555555555',
        spvApplicationId: '77777777-7777-4777-8777-777777777777',
        escrowSetupId: '88888888-8888-4888-8888-888888888888',
        targetYield: 12,
      }),
    };
    const ptcParametersRepository = {
      findOne: sinon.stub().resolves({
        id: '99999999-9999-4999-8999-999999999999',
        faceValuePerUnit: 100,
        maxUnitsPerInvestor: 100,
      }),
    };
    const escrowSetupRepository = {
      findOne: sinon.stub().resolves(null),
    };
    const investorClosedInvestmentRepository = {
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const requestCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'redemptionRequestId'),
        ) as {redemptionRequestId?: string};
        const transactionCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'transactionId'),
        ) as {transactionId?: string};

        return Promise.resolve(
          closedInvestments.find(investment => {
            if (
              requestCondition?.redemptionRequestId &&
              investment.redemptionRequestId === requestCondition.redemptionRequestId &&
              investment.isDeleted === false
            ) {
              return true;
            }
            if (
              transactionCondition?.transactionId &&
              investment.transactionId === transactionCondition.transactionId &&
              investment.isDeleted === false
            ) {
              return true;
            }
            return false;
          }) ?? null,
        );
      }),
      create: sinon.stub().callsFake((data: object) => {
        closedInvestments.push(data as Record<string, unknown>);
        return Promise.resolve(data);
      }),
      find: sinon.stub().callsFake(() => Promise.resolve(closedInvestments)),
    };

    const service = new PtcIssuanceService(
      datasource as never,
      ptcIssuanceRepository as never,
      investorPtcHoldingRepository as never,
      investorEscrowAccountRepository as never,
      investorEscrowLedgerRepository as never,
      investorClosedInvestmentRepository as never,
      investorProfileRepository as never,
      transactionRepository as never,
      spvRepository as never,
      poolFinancialsRepository as never,
      ptcParametersRepository as never,
      escrowSetupRepository as never,
    );

    return {
      service,
      wallet,
      ledgers,
      holdings,
      closedInvestments,
      investorEscrowAccountRepository,
      investorEscrowLedgerRepository,
      investorClosedInvestmentRepository,
    };
  }

  function createInvestorPortfolioServiceFixture(options?: {
    closedInvestments?: Array<Record<string, unknown>>;
    holdings?: Array<Record<string, unknown>>;
  }) {
    const closedInvestments = options?.closedInvestments ?? [];
    const holdings = options?.holdings ?? [];
    const investorProfiles = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        usersId: investorUser.id,
        isActive: true,
        isDeleted: false,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        usersId: '22222222-2222-4222-8222-222222222222',
        isActive: true,
        isDeleted: false,
      },
    ];
    const spvs = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        spvName: 'Invoice Pool Alpha',
        originatorName: 'Originator A',
        isDeleted: false,
        spvApplicationId: '77777777-7777-4777-8777-777777777777',
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        spvName: 'Invoice Pool Beta',
        originatorName: 'Originator B',
        isDeleted: false,
        spvApplicationId: '88888888-8888-4888-8888-888888888888',
      },
    ];

    const investorProfileRepository = {
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const usersCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'usersId'),
        ) as {usersId?: string};

        return Promise.resolve(
          investorProfiles.find(
            profile =>
              profile.usersId === usersCondition?.usersId &&
              profile.isActive === true &&
              profile.isDeleted === false,
          ) ?? null,
        );
      }),
    };

    const spvRepository = {
      find: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const inqCondition = where.and.find(
          condition =>
            typeof condition === 'object' &&
            condition !== null &&
            Object.prototype.hasOwnProperty.call(condition, 'id'),
        ) as {id?: {inq?: string[]}};
        const spvIds = inqCondition?.id?.inq ?? [];

        return Promise.resolve(spvs.filter(spv => spvIds.includes(spv.id)));
      }),
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const idCondition = where.and.find(
          condition =>
            typeof condition === 'object' &&
            condition !== null &&
            Object.prototype.hasOwnProperty.call(condition, 'id'),
        ) as {id?: string};
        return Promise.resolve(spvs.find(spv => spv.id === idCondition?.id) ?? null);
      }),
      findById: sinon.stub().callsFake((id: string) => {
        const spv = spvs.find(row => row.id === id);
        return Promise.resolve(spv ?? spvs[0]);
      }),
    };

    const investorClosedInvestmentRepository = {
      find: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const investorCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'investorProfileId'),
        ) as {investorProfileId?: string};
        const spvCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'spvId'),
        ) as {spvId?: string};

        let filteredRows = closedInvestments.filter(
          investment =>
            investment.investorProfileId === investorCondition?.investorProfileId &&
            investment.isDeleted === false,
        );

        if (spvCondition?.spvId) {
          filteredRows = filteredRows.filter(
            investment => investment.spvId === spvCondition.spvId,
          );
        }

        return Promise.resolve(filteredRows);
      }),
    };

    const investorPtcHoldingRepository = {
      find: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const investorCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'investorProfileId'),
        ) as {investorProfileId?: string};
        const ownedUnitsCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'ownedUnits'),
        ) as {ownedUnits?: {gt?: number}};
        const gtValue = Number(ownedUnitsCondition?.ownedUnits?.gt ?? -Infinity);

        const filteredRows = holdings.filter(
          holding =>
            holding.investorProfileId === investorCondition?.investorProfileId &&
            holding.isDeleted === false &&
            Number(holding.ownedUnits ?? 0) > gtValue,
        );

        return Promise.resolve(filteredRows);
      }),
    };

    const service = new InvestorInvestmentsService(
      investorProfileRepository as never,
      spvRepository as never,
      {findOne: sinon.stub().resolves(null)} as never,
      {} as never,
      {} as never,
      {find: sinon.stub().resolves([])} as never,
      investorClosedInvestmentRepository as never,
      investorPtcHoldingRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return {
      service,
      investorClosedInvestmentRepository,
    };
  }

  function createWalletWithdrawalServiceFixture() {
    const tx = {
      commit: sinon.stub().resolves(),
      rollback: sinon.stub().resolves(),
    };
    const investorProfiles = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        usersId: investorUser.id,
        isActive: true,
        isDeleted: false,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        usersId: otherInvestorUser.id,
        isActive: true,
        isDeleted: false,
      },
    ];
    const walletsByInvestorProfileId: Record<string, Record<string, unknown>> = {
      '33333333-3333-4333-8333-333333333333': {
        id: 'wallet-1',
        investorProfileId: '33333333-3333-4333-8333-333333333333',
        currentBalance: 1000,
        blockedBalance: 0,
        currency: 'INR',
        bankName: 'Unit Test Bank',
        accountHolderName: 'Investor One',
        accountNumber: '1234567890',
        isActive: true,
        isDeleted: false,
        status: 'active',
      },
      '44444444-4444-4444-8444-444444444444': {
        id: 'wallet-2',
        investorProfileId: '44444444-4444-4444-8444-444444444444',
        currentBalance: 500,
        blockedBalance: 0,
        currency: 'INR',
        bankName: 'Unit Test Bank',
        accountHolderName: 'Investor Two',
        accountNumber: '0987654321',
        isActive: true,
        isDeleted: false,
        status: 'active',
      },
    };
    const ledgers: Array<Record<string, unknown>> = [];
    const datasourceExecute = sinon.stub().callsFake(() => Promise.resolve([]));
    const datasource = {
      beginTransaction: sinon.stub().resolves(tx),
      execute: datasourceExecute,
    };
    const withdrawalRequestRepository = {};
    const investorProfileRepository = {
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const usersCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'usersId'),
        ) as {usersId?: string};

        return Promise.resolve(
          investorProfiles.find(
            profile =>
              profile.usersId === usersCondition?.usersId &&
              profile.isActive === true &&
              profile.isDeleted === false,
          ) ?? null,
        );
      }),
    };
    const investorEscrowAccountRepository = {
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const investorProfileCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'investorProfileId'),
        ) as {investorProfileId?: string};
        const investorProfileId = investorProfileCondition?.investorProfileId ?? '';

        return Promise.resolve(
          walletsByInvestorProfileId[investorProfileId] ?? null,
        );
      }),
      updateById: sinon.stub().callsFake((id: string, data: object) => {
        const wallet = Object.values(walletsByInvestorProfileId).find(
          row => row.id === id,
        );
        if (wallet) {
          Object.assign(wallet, data);
        }
        return Promise.resolve();
      }),
    };
    const investorEscrowLedgerRepository = {
      findOne: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const investorIdCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'investorId'),
        ) as {investorId?: string};
        const typeCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'type'),
        ) as {type?: string};
        const referenceTypeCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'referenceType'),
        ) as {referenceType?: string};
        const referenceIdCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'referenceId'),
        ) as {referenceId?: string};
        const statusCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'status'),
        ) as {status?: string};
        const isDeletedCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'isDeleted'),
        ) as {isDeleted?: boolean};

        return Promise.resolve(
          ledgers.find(ledger => {
            if (
              investorIdCondition?.investorId &&
              ledger.investorId !== investorIdCondition.investorId
            ) {
              return false;
            }
            if (typeCondition?.type && ledger.type !== typeCondition.type) {
              return false;
            }
            if (
              referenceTypeCondition?.referenceType &&
              ledger.referenceType !== referenceTypeCondition.referenceType
            ) {
              return false;
            }
            if (
              referenceIdCondition?.referenceId &&
              ledger.referenceId !== referenceIdCondition.referenceId
            ) {
              return false;
            }
            if (
              statusCondition?.status &&
              ledger.status !== statusCondition.status
            ) {
              return false;
            }
            if (
              isDeletedCondition?.isDeleted !== undefined &&
              ledger.isDeleted !== isDeletedCondition.isDeleted
            ) {
              return false;
            }
            return true;
          }) ?? null,
        );
      }),
      find: sinon.stub().callsFake(({where}: {where: {and: object[]}}) => {
        const investorIdCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'investorId'),
        ) as {investorId?: string};
        const isDeletedCondition = where.and.find(condition =>
          Object.prototype.hasOwnProperty.call(condition, 'isDeleted'),
        ) as {isDeleted?: boolean};

        return Promise.resolve(
          ledgers.filter(ledger => {
            if (
              investorIdCondition?.investorId &&
              ledger.investorId !== investorIdCondition.investorId
            ) {
              return false;
            }
            if (
              isDeletedCondition?.isDeleted !== undefined &&
              ledger.isDeleted !== isDeletedCondition.isDeleted
            ) {
              return false;
            }
            return true;
          }),
        );
      }),
      create: sinon.stub().callsFake((data: object) => {
        ledgers.push(data as Record<string, unknown>);
        return Promise.resolve(data);
      }),
    };
    const investorEscrowAccountService = {
      getOrCreateActiveEscrowForApprovedInvestor: sinon
        .stub()
        .callsFake((investorProfileId: string) =>
          Promise.resolve(walletsByInvestorProfileId[investorProfileId]),
        ),
    };

    const service = new WalletWithdrawalService(
      datasource as never,
      withdrawalRequestRepository as never,
      investorProfileRepository as never,
      investorEscrowAccountRepository as never,
      investorEscrowLedgerRepository as never,
      investorEscrowAccountService as never,
    );

    return {
      service,
      ledgers,
      datasourceExecute,
      investorEscrowAccountRepository,
      walletsByInvestorProfileId,
    };
  }

  it('rejects buy when blocked balance makes available balance insufficient', async () => {
    const {service, investorEscrowAccountRepository} = createPtcServiceFixture({
      currentBalance: 1000,
      blockedBalance: 900,
    });

    await expect(
      service.buyUnits(
        investorUser,
        '55555555-5555-4555-8555-555555555555',
        2,
      ),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /Insufficient available/);
    sinon.assert.notCalled(investorEscrowAccountRepository.updateById);
  });

  it('debits buy from available balance and preserves blocked balance', async () => {
    const {service, wallet} = createPtcServiceFixture({
      currentBalance: 1000,
      blockedBalance: 100,
    });

    const result = await service.buyUnits(
      investorUser,
      '55555555-5555-4555-8555-555555555555',
      2,
    );

    expect(result.balanceBefore).to.equal(1000);
    expect(result.availableBalanceBefore).to.equal(900);
    expect(result.balanceAfter).to.equal(800);
    expect(wallet.blockedBalance).to.equal(100);
  });

  it('rejects decimal units instead of flooring them', async () => {
    const {service} = createPtcServiceFixture();

    await expect(
      service.buyUnits(
        investorUser,
        '55555555-5555-4555-8555-555555555555',
        1.5,
      ),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /positive integer/);
  });

  it('rejects decimal redeem units instead of flooring them', async () => {
    const {service} = createPtcServiceFixture();

    await expect(
      service.redeemUnits(
        investorUser,
        '55555555-5555-4555-8555-555555555555',
        1.5,
      ),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /positive integer/);
  });

  it('rejects zero and negative redeem units', async () => {
    const {service} = createPtcServiceFixture();

    await expect(
      service.redeemUnits(
        investorUser,
        '55555555-5555-4555-8555-555555555555',
        0,
      ),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /positive integer/);
    await expect(
      service.redeemUnits(
        investorUser,
        '55555555-5555-4555-8555-555555555555',
        -1,
      ),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /positive integer/);
  });

  it('accepts positive integer redeem units', async () => {
    const {service} = createPtcServiceFixture({
      holdings: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ptcIssuanceId: '44444444-4444-4444-8444-444444444444',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          spvId: '55555555-5555-4555-8555-555555555555',
          ownedUnits: 10,
          investedAmount: 1000,
          isDeleted: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    sinon
      .stub(
        service as unknown as {ensureRedemptionWindowOrFail: () => void},
        'ensureRedemptionWindowOrFail',
      )
      .returns(undefined);
    sinon.stub(service, 'processPendingRedemption').resolves({
      redemptionRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      transactionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      redeemedUnits: 2,
      totalPayout: 200,
      grossPayout: 200,
      netPayout: 200,
      interestPayout: 0,
      annualInterestRate: 12,
      capitalGain: 0,
      stampDutyAmount: 0,
      stampDutyRate: 0,
      balanceBefore: 1000,
      balanceAfter: 1200,
    });
    sinon
      .stub(
        service as unknown as {
          fetchInvestorOwnedUnits: (
            investorProfileId: string,
            spvId: string,
          ) => Promise<number>;
        },
        'fetchInvestorOwnedUnits',
      )
      .resolves(8);

    const result = await service.redeemUnits(
      investorUser,
      '55555555-5555-4555-8555-555555555555',
      2,
    );

    expect(result.requestedUnits).to.equal(2);
    expect(result.availableUnitsBefore).to.equal(10);
    expect(result.remainingUnits).to.equal(8);
  });

  it('does not create a closed snapshot for partial redemptions', async () => {
    const {service, holdings, closedInvestments} = createPtcServiceFixture({
      holdings: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ptcIssuanceId: '44444444-4444-4444-8444-444444444444',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          usersId: investorUser.id,
          spvId: '55555555-5555-4555-8555-555555555555',
          poolFinancialsId: '66666666-6666-4666-8666-666666666666',
          ownedUnits: 10,
          investedAmount: 1000,
          isDeleted: false,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        },
      ],
    });

    const result = await service.processPendingRedemption(
      {
        id: 'partial-redemption-request',
        investorProfileId: '33333333-3333-4333-8333-333333333333',
        spvId: '55555555-5555-4555-8555-555555555555',
        units: 4,
        unitPrice: 100,
        status: 'PENDING',
        transactionId: 'partial-redemption-transaction',
      },
      investorUser.id,
    );

    expect(result.redeemedUnits).to.equal(4);
    expect(closedInvestments).to.have.length(0);
    expect(holdings[0].ownedUnits).to.equal(6);
  });

  it('creates a closed snapshot exactly once on full redemption', async () => {
    const {service, closedInvestments} = createPtcServiceFixture({
      holdings: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ptcIssuanceId: '44444444-4444-4444-8444-444444444444',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          usersId: investorUser.id,
          spvId: '55555555-5555-4555-8555-555555555555',
          poolFinancialsId: '66666666-6666-4666-8666-666666666666',
          ownedUnits: 10,
          investedAmount: 1000,
          isDeleted: false,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        },
      ],
    });

    const request = {
      id: 'full-redemption-request',
      investorProfileId: '33333333-3333-4333-8333-333333333333',
      spvId: '55555555-5555-4555-8555-555555555555',
      units: 10,
      unitPrice: 100,
      status: 'PENDING',
      transactionId: 'full-redemption-transaction',
    };

    const result = await service.processPendingRedemption(request, investorUser.id);

    expect(closedInvestments).to.have.length(1);
    const snapshot = closedInvestments[0];
    expect(snapshot.investorProfileId).to.equal(request.investorProfileId);
    expect(snapshot.spvId).to.equal(request.spvId);
    expect(snapshot.totalUnits).to.equal(10);
    expect(snapshot.totalInvestedAmount).to.equal(1000);
    expect(snapshot.totalRedeemedAmount).to.equal(result.grossPayout);
    expect(snapshot.interestPayout).to.equal(result.interestPayout);
    expect(snapshot.redemptionRequestId).to.equal(request.id);
  });

  it('does not create duplicate closed snapshots for the same redemption identifiers', async () => {
    const {service, closedInvestments} = createPtcServiceFixture({
      holdings: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ptcIssuanceId: '44444444-4444-4444-8444-444444444444',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          usersId: investorUser.id,
          spvId: '55555555-5555-4555-8555-555555555555',
          poolFinancialsId: '66666666-6666-4666-8666-666666666666',
          ownedUnits: 10,
          investedAmount: 1000,
          isDeleted: false,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        },
      ],
      closedInvestments: [
        {
          id: 'existing-snapshot',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          spvId: '55555555-5555-4555-8555-555555555555',
          redemptionRequestId: 'duplicate-redemption-request',
          transactionId: 'duplicate-redemption-transaction',
          isDeleted: false,
        },
      ],
    });

    await service.processPendingRedemption(
      {
        id: 'duplicate-redemption-request',
        investorProfileId: '33333333-3333-4333-8333-333333333333',
        spvId: '55555555-5555-4555-8555-555555555555',
        units: 10,
        unitPrice: 100,
        status: 'PENDING',
        transactionId: 'duplicate-redemption-transaction',
      },
      investorUser.id,
    );

    expect(closedInvestments).to.have.length(1);
  });

  it('rejects unavailable full allocation unless partial allocation is explicit', async () => {
    const {service} = createPtcServiceFixture({remainingUnits: 2});

    await expect(
      service.buyUnits(
        investorUser,
        '55555555-5555-4555-8555-555555555555',
        5,
      ),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /Full requested units/);
  });

  it('allocates available units when partial allocation is explicit', async () => {
    const {service} = createPtcServiceFixture({remainingUnits: 2});

    const result = await service.buyUnits(
      investorUser,
      '55555555-5555-4555-8555-555555555555',
      5,
      {allowPartialAllocation: true},
    );

    expect(result.allocatedUnits).to.equal(2);
    expect(result.partialAllocation).to.equal(true);
  });

  it('returns the same idempotent buy result without double debit', async () => {
    const {service, wallet, investorEscrowAccountRepository, ledgers} =
      createPtcServiceFixture({currentBalance: 1000});

    const first = await service.buyUnits(
      investorUser,
      '55555555-5555-4555-8555-555555555555',
      2,
      {idempotencyKey: 'client-key-1'},
    );
    const second = await service.buyUnits(
      investorUser,
      '55555555-5555-4555-8555-555555555555',
      2,
      {idempotencyKey: 'client-key-1'},
    );

    expect(second).to.deepEqual(first);
    expect(wallet.currentBalance).to.equal(800);
    sinon.assert.calledOnce(investorEscrowAccountRepository.updateById);
    expect(ledgers).to.have.length(1);
  });

  it('uses metadata.spvId for new buy ledgers and referenceId for old buy ledgers', async () => {
    const investorEscrowLedgerRepository = {
      find: sinon.stub().resolves([
        {
          id: 'old-ledger',
          investorId: '33333333-3333-4333-8333-333333333333',
          type: InvestorEscrowLedgerType.BUY_DEBIT,
          amount: 100,
          status: InvestorEscrowLedgerStatus.SUCCESS,
          referenceId: 'old-spv',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          isDeleted: false,
        },
        {
          id: 'new-ledger',
          investorId: '33333333-3333-4333-8333-333333333333',
          type: InvestorEscrowLedgerType.BUY_DEBIT,
          amount: 200,
          status: InvestorEscrowLedgerStatus.SUCCESS,
          referenceId: 'new-spv:client-key-1',
          metadata: {spvId: 'new-spv'},
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          isDeleted: false,
        },
      ]),
    };
    const service = new InvestorInvestmentsService(
      {findOne: sinon.stub().resolves({id: '33333333-3333-4333-8333-333333333333'})} as never,
      {find: sinon.stub().resolves([
        {id: 'old-spv', spvName: 'Old pool'},
        {id: 'new-spv', spvName: 'New pool'},
      ])} as never,
      {} as never,
      {} as never,
      {} as never,
      investorEscrowLedgerRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listInvestorPortfolioOnlineTransactions(
      investorUser,
    );

    expect(result.data.map(row => row.spvId)).to.deepEqual(['old-spv', 'new-spv']);
  });

  it('lists closed snapshots even when holdings are inactive and units are zero', async () => {
    const {service} = createInvestorPortfolioServiceFixture({
      holdings: [
        {
          id: 'inactive-holding',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          spvId: '55555555-5555-4555-8555-555555555555',
          ownedUnits: 0,
          isActive: false,
          isDeleted: false,
        },
      ],
      closedInvestments: [
        {
          id: 'closed-1',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          spvId: '55555555-5555-4555-8555-555555555555',
          totalUnits: 10,
          totalInvestedAmount: 1000,
          totalRedeemedAmount: 1100,
          netPayout: 1090,
          interestPayout: 90,
          annualInterestRate: 12.5,
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          closedAt: new Date('2026-04-01T00:00:00.000Z'),
          status: 'CLOSED',
          isDeleted: false,
        },
      ],
    });

    const result = await service.listInvestorClosedInvestments(investorUser, {
      limit: 10,
      skip: 0,
    });

    expect(result.totalCount).to.equal(1);
    expect(result.data[0].id).to.equal('closed-1');
    expect(result.data[0].spvId).to.equal('55555555-5555-4555-8555-555555555555');
  });

  it('keeps active portfolio empty for fully redeemed holdings', async () => {
    const {service} = createInvestorPortfolioServiceFixture({
      holdings: [
        {
          id: 'zero-holding',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          spvId: '55555555-5555-4555-8555-555555555555',
          ownedUnits: 0,
          investedAmount: 0,
          isDeleted: false,
        },
      ],
    });

    const result = await service.getInvestorPortfolioData(investorUser, 'active');

    expect(result.summary.investedTillDate).to.equal(0);
    expect(result.summary.totalEarnings).to.equal(0);
    expect(result.onlinePayment).to.equal(null);
  });

  it('does not expose another investor closed snapshots', async () => {
    const {service, investorClosedInvestmentRepository} =
      createInvestorPortfolioServiceFixture({
        closedInvestments: [
          {
            id: 'mine',
            investorProfileId: '33333333-3333-4333-8333-333333333333',
            spvId: '55555555-5555-4555-8555-555555555555',
            totalUnits: 3,
            totalInvestedAmount: 300,
            totalRedeemedAmount: 320,
            netPayout: 318,
            interestPayout: 18,
            annualInterestRate: 12,
            startDate: new Date('2026-02-01T00:00:00.000Z'),
            closedAt: new Date('2026-03-01T00:00:00.000Z'),
            status: 'CLOSED',
            isDeleted: false,
          },
          {
            id: 'other-user',
            investorProfileId: '44444444-4444-4444-8444-444444444444',
            spvId: '66666666-6666-4666-8666-666666666666',
            totalUnits: 5,
            totalInvestedAmount: 500,
            totalRedeemedAmount: 530,
            netPayout: 525,
            interestPayout: 25,
            annualInterestRate: 10,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            closedAt: new Date('2026-02-01T00:00:00.000Z'),
            status: 'CLOSED',
            isDeleted: false,
          },
        ],
      });

    const result = await service.listInvestorClosedInvestments(investorUser);

    expect(result.data.map(row => row.id)).to.deepEqual(['mine']);
    const firstFindCallArgs = investorClosedInvestmentRepository.find.getCall(0)
      .args[0] as {where: {and: Array<Record<string, string>>}};
    expect(
      firstFindCallArgs.where.and.some(
        condition =>
          condition.investorProfileId ===
          '33333333-3333-4333-8333-333333333333',
      ),
    ).to.equal(true);
  });

  it('restricts withdrawal processing to admin roles', () => {
    const metadata = MetadataInspector.getMethodMetadata(
      'authorization.metadata',
      WalletWithdrawalController.prototype,
      'processWithdrawal',
    ) as {roles?: string[]} | undefined;

    expect(metadata?.roles).to.containEql('admin');
    expect(metadata?.roles).to.containEql('super_admin');
    expect(metadata?.roles).to.not.containEql('investor');
  });

  it('credits first idempotent deposit exactly once', async () => {
    const {service, ledgers, walletsByInvestorProfileId} =
      createWalletWithdrawalServiceFixture();

    const result = await service.addFunds(
      investorUser,
      250,
      'first deposit',
      {idempotencyKey: 'deposit-key-0001'},
    );

    expect(result.wallet.currentBalance).to.equal(1250);
    expect(result.transactionId).to.be.String();
    expect(
      walletsByInvestorProfileId['33333333-3333-4333-8333-333333333333']
        .currentBalance,
    ).to.equal(1250);
    expect(ledgers).to.have.length(1);
    expect(ledgers[0].type).to.equal(InvestorEscrowLedgerType.DEPOSIT);
    expect(ledgers[0].referenceType).to.equal('DEPOSIT_IDEMPOTENCY');
    expect(ledgers[0].referenceId).to.equal('deposit-key-0001');
  });

  it('returns original idempotent deposit response on retry without re-credit', async () => {
    const {service, ledgers, investorEscrowAccountRepository} =
      createWalletWithdrawalServiceFixture();

    const first = await service.addFunds(
      investorUser,
      120,
      'retryable deposit',
      {idempotencyKey: 'deposit-key-0002'},
    );
    const second = await service.addFunds(
      investorUser,
      120,
      'retryable deposit',
      {idempotencyKey: 'deposit-key-0002'},
    );

    expect(second.transactionId).to.equal(first.transactionId);
    expect(second.wallet.currentBalance).to.equal(first.wallet.currentBalance);
    expect(ledgers).to.have.length(1);
    sinon.assert.calledOnce(investorEscrowAccountRepository.updateById);
  });

  it('credits again for a different idempotency key', async () => {
    const {service, ledgers, walletsByInvestorProfileId} =
      createWalletWithdrawalServiceFixture();

    await service.addFunds(investorUser, 75, undefined, {
      idempotencyKey: 'deposit-key-0003',
    });
    const second = await service.addFunds(investorUser, 75, undefined, {
      idempotencyKey: 'deposit-key-0004',
    });

    expect(second.wallet.currentBalance).to.equal(1150);
    expect(
      walletsByInvestorProfileId['33333333-3333-4333-8333-333333333333']
        .currentBalance,
    ).to.equal(1150);
    expect(ledgers).to.have.length(2);
  });

  it('allows same idempotency key for different investors', async () => {
    const {service, ledgers, walletsByInvestorProfileId} =
      createWalletWithdrawalServiceFixture();

    const firstInvestor = await service.addFunds(investorUser, 40, undefined, {
      idempotencyKey: 'shared-deposit-key',
    });
    const secondInvestor = await service.addFunds(
      otherInvestorUser,
      40,
      undefined,
      {idempotencyKey: 'shared-deposit-key'},
    );

    expect(firstInvestor.transactionId).to.not.equal(secondInvestor.transactionId);
    expect(
      walletsByInvestorProfileId['33333333-3333-4333-8333-333333333333']
        .currentBalance,
    ).to.equal(1040);
    expect(
      walletsByInvestorProfileId['44444444-4444-4444-8444-444444444444']
        .currentBalance,
    ).to.equal(540);
    expect(ledgers).to.have.length(2);
  });

  it('preserves legacy deposit behavior when idempotency key is omitted', async () => {
    const {service, ledgers, walletsByInvestorProfileId} =
      createWalletWithdrawalServiceFixture();

    const first = await service.addFunds(investorUser, 60, 'legacy one');
    const second = await service.addFunds(investorUser, 60, 'legacy two');

    expect(first.transactionId).to.not.equal(second.transactionId);
    expect(
      walletsByInvestorProfileId['33333333-3333-4333-8333-333333333333']
        .currentBalance,
    ).to.equal(1120);
    expect(ledgers).to.have.length(2);
    expect(ledgers[0].referenceType).to.equal('DEPOSIT');
    expect(ledgers[1].referenceType).to.equal('DEPOSIT');
  });

  it('rejects invalid idempotency key values', async () => {
    const {service} = createWalletWithdrawalServiceFixture();

    await expect(
      service.addFunds(investorUser, 100, undefined, {idempotencyKey: '   '}),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /non-empty string/);
    await expect(
      service.addFunds(investorUser, 100, undefined, {idempotencyKey: 'short'}),
    ).to.be.rejectedWith(HttpErrors.BadRequest, /between 8 and 120/);
  });

  it('does not execute schema DDL in wallet request paths', async () => {
    const {service, datasourceExecute} = createWalletWithdrawalServiceFixture();

    expect(
      (service as unknown as {ensureWalletSchema?: unknown}).ensureWalletSchema,
    ).to.equal(undefined);

    await service.getWallet(investorUser);
    await service.addFunds(investorUser, 25, 'ddl-check', {
      idempotencyKey: 'deposit-key-ddl-1',
    });

    const allSql = datasourceExecute
      .getCalls()
      .map(call => String(call.args[0] ?? '').toLowerCase());

    expect(
      allSql.some(
        sql =>
          sql.includes('alter table') ||
          sql.includes('create table') ||
          sql.includes('add column'),
      ),
    ).to.equal(false);
  });

  it('returns masked wallet account number with only last 4 digits visible', async () => {
    const service = new WalletWithdrawalService(
      {
        beginTransaction: sinon.stub(),
        execute: sinon.stub().resolves([]),
      } as never,
      {} as never,
      {
        findOne: sinon.stub().resolves({
          id: '33333333-3333-4333-8333-333333333333',
          usersId: investorUser.id,
          isActive: true,
          isDeleted: false,
        }),
      } as never,
      {
        findOne: sinon.stub().resolves({
          id: '22222222-2222-4222-8222-222222222222',
          investorProfileId: '33333333-3333-4333-8333-333333333333',
          currentBalance: 1000,
          blockedBalance: 100,
          currency: 'INR',
          bankName: 'Unit Test Bank',
          accountHolderName: 'Investor One',
          accountNumber: '1234567890',
          isActive: true,
          isDeleted: false,
          status: 'active',
        }),
      } as never,
      {} as never,
      {
        getOrCreateActiveEscrowForApprovedInvestor: sinon.stub().resolves(),
      } as never,
    );

    const wallet = await service.getWallet(investorUser);

    expect(wallet.accountNumber).to.equal('******7890');
  });

  it('does not keep the non-partial model unique index for active holdings', () => {
    const settings = InvestorPtcHolding.definition.settings;

    expect(settings.indexes).to.be.undefined();
  });

  it('releases blocked balance when withdrawal processing fails', async () => {
    const tx = {
      commit: sinon.stub().resolves(),
      rollback: sinon.stub().resolves(),
    };
    const request = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      investorProfileId: '33333333-3333-4333-8333-333333333333',
      amount: 100,
      status: WithdrawalRequestStatus.PENDING,
      isDeleted: false,
      remarks: null,
    };
    const wallet = {
      id: '22222222-2222-4222-8222-222222222222',
      investorProfileId: request.investorProfileId,
      currentBalance: 500,
      blockedBalance: 100,
      isActive: true,
      isDeleted: false,
      status: 'active',
    };
    const withdrawalRequestRepository = {
      findById: sinon.stub().resolves(request),
      updateById: sinon.stub().callsFake((_id: string, data: object) => {
        Object.assign(request, data);
      }),
    };
    const investorEscrowAccountRepository = {
      findOne: sinon.stub().resolves(wallet),
      updateById: sinon.stub().callsFake((_id: string, data: object) => {
        Object.assign(wallet, data);
      }),
    };
    const service = new WalletWithdrawalService(
      {
        beginTransaction: sinon.stub().resolves(tx),
        execute: sinon.stub().resolves([]),
      } as never,
      withdrawalRequestRepository as never,
      {} as never,
      investorEscrowAccountRepository as never,
      {create: sinon.stub().rejects(new Error('bank rail failed'))} as never,
      {} as never,
    );

    await expect(service.processWithdrawal(request.id)).to.be.rejectedWith(
      /bank rail failed/,
    );

    expect(request.status).to.equal(WithdrawalRequestStatus.FAILED);
    expect(wallet.blockedBalance).to.equal(0);
  });
});

