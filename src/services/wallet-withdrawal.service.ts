import {inject} from '@loopback/core';
import {IsolationLevel, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {AmplioDataSource} from '../datasources';
import {
  InvestorEscrowAccount,
  InvestorEscrowLedgerStatus,
  InvestorEscrowLedgerType,
  InvestorProfile,
  WithdrawalRequest,
  WithdrawalRequestStatus,
} from '../models';
import {
  InvestorEscrowAccountRepository,
  InvestorEscrowLedgerRepository,
  InvestorProfileRepository,
  WithdrawalRequestRepository,
} from '../repositories';
import {InvestorEscrowAccountService} from './investor-escrow-account.service';

export class WalletWithdrawalService {
  constructor(
    @inject('datasources.amplio')
    private datasource: AmplioDataSource,
    @repository(WithdrawalRequestRepository)
    private withdrawalRequestRepository: WithdrawalRequestRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(InvestorEscrowAccountRepository)
    private investorEscrowAccountRepository: InvestorEscrowAccountRepository,
    @repository(InvestorEscrowLedgerRepository)
    private investorEscrowLedgerRepository: InvestorEscrowLedgerRepository,
    @inject('service.investorEscrowAccount.service')
    private investorEscrowAccountService: InvestorEscrowAccountService,
  ) {}

  private normalizeAmount(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(2));
  }

  private getOptions(tx?: unknown) {
    return tx ? {transaction: tx} : undefined;
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string | undefined {
    if (idempotencyKey === undefined) {
      return undefined;
    }

    const normalizedKey = String(idempotencyKey).trim();

    if (!normalizedKey) {
      throw new HttpErrors.BadRequest(
        'idempotencyKey must be a non-empty string when provided',
      );
    }

    if (normalizedKey.length < 8 || normalizedKey.length > 120) {
      throw new HttpErrors.BadRequest(
        'idempotencyKey must be between 8 and 120 characters',
      );
    }

    return normalizedKey;
  }

  private resolveDepositIdempotencyKey(payload: {
    idempotencyKey?: string;
    externalTransactionId?: string;
  }): string | undefined {
    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(
      payload.idempotencyKey,
    );

    if (normalizedIdempotencyKey) {
      return normalizedIdempotencyKey;
    }

    return this.normalizeIdempotencyKey(payload.externalTransactionId);
  }

  private async lockDepositIdempotencyKey(
    investorProfileId: string,
    idempotencyKey: string,
    tx: unknown,
  ): Promise<void> {
    await this.datasource.execute(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [investorProfileId, idempotencyKey],
      this.getOptions(tx),
    );
  }

  private async fetchExistingSuccessfulDepositByIdempotencyKey(
    investorProfileId: string,
    idempotencyKey: string,
    tx: unknown,
  ) {
    return this.investorEscrowLedgerRepository.findOne(
      {
        where: {
          and: [
            {investorId: investorProfileId},
            {type: InvestorEscrowLedgerType.DEPOSIT},
            {referenceType: 'DEPOSIT_IDEMPOTENCY'},
            {referenceId: idempotencyKey},
            {status: InvestorEscrowLedgerStatus.SUCCESS},
            {isDeleted: false},
          ],
        },
      },
      this.getOptions(tx),
    );
  }

  private extractDepositResultFromLedgerMetadata(ledger: {
    metadata?: object;
    transactionId?: string;
  }): {
    transactionId?: string;
    wallet?: {
      id: string;
      investorProfileId: string;
      currentBalance: number;
      blockedBalance: number;
      availableBalance: number;
      currency: string;
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
    };
  } | null {
    if (!ledger.metadata || typeof ledger.metadata !== 'object') {
      return null;
    }

    const metadata = ledger.metadata as {
      depositResult?: {
        transactionId?: string;
        wallet?: {
          id: string;
          investorProfileId: string;
          currentBalance: number;
          blockedBalance: number;
          availableBalance: number;
          currency: string;
          bankName: string;
          accountHolderName: string;
          accountNumber: string;
        };
      };
    };

    return metadata.depositResult ?? null;
  }

  private buildDepositResponse(
    wallet: InvestorEscrowAccount,
    transactionId: string,
  ): {
    wallet: {
      id: string;
      investorProfileId: string;
      currentBalance: number;
      blockedBalance: number;
      availableBalance: number;
      currency: string;
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
    };
    transactionId: string;
  } {
    return {
      wallet: this.buildWalletSummary(wallet),
      transactionId,
    };
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

  private async fetchWalletOrFail(
    investorProfileId: string,
    tx?: unknown,
  ): Promise<InvestorEscrowAccount> {
    const wallet = await this.investorEscrowAccountRepository.findOne(
      {
        where: {
          and: [
            {investorProfileId},
            {isActive: true},
            {isDeleted: false},
            {status: {neq: 'inactive'}},
          ],
        },
      },
      this.getOptions(tx),
    );

    if (!wallet) {
      throw new HttpErrors.BadRequest('Investor wallet not found');
    }

    return wallet;
  }

  private async lockWalletRow(
    investorProfileId: string,
    tx: unknown,
  ): Promise<void> {
    await this.datasource.execute(
      `SELECT id FROM public.investor_escrow_accounts
       WHERE investorprofileid = $1
         AND isactive = true
         AND isdeleted = false
       FOR UPDATE`,
      [investorProfileId],
      this.getOptions(tx),
    );
  }

  private async lockWithdrawalRequestRow(
    requestId: string,
    tx: unknown,
  ): Promise<void> {
    await this.datasource.execute(
      `SELECT id FROM public.withdrawal_request
       WHERE id = $1
         AND isdeleted = false
       FOR UPDATE`,
      [requestId],
      this.getOptions(tx),
    );
  }

  private maskAccountNumber(accountNumber?: string): string {
    const normalizedAccountNumber = String(accountNumber ?? '').trim();

    if (!normalizedAccountNumber) {
      return '';
    }

    const visibleDigits = normalizedAccountNumber.slice(-4);
    const maskedLength = Math.max(normalizedAccountNumber.length - 4, 0);

    return `${'*'.repeat(maskedLength)}${visibleDigits}`;
  }

  private buildWalletSummary(wallet: InvestorEscrowAccount) {
    const currentBalance = this.normalizeAmount(wallet.currentBalance);
    const blockedBalance = this.normalizeAmount(wallet.blockedBalance);
    const availableBalance = this.normalizeAmount(currentBalance - blockedBalance);

    return {
      id: wallet.id,
      investorProfileId: wallet.investorProfileId,
      currentBalance,
      blockedBalance,
      availableBalance,
      currency: wallet.currency ?? 'INR',
      bankName: wallet.bankName,
      accountHolderName: wallet.accountHolderName,
      accountNumber: this.maskAccountNumber(wallet.accountNumber),
    };
  }

  private async failWithdrawalAndReleaseBlock(
    requestId: string,
    reason: string,
  ): Promise<void> {
    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      await this.lockWithdrawalRequestRow(requestId, tx);

      const withdrawalRequest = await this.withdrawalRequestRepository.findById(
        requestId,
        undefined,
        this.getOptions(tx),
      );

      if (
        withdrawalRequest.isDeleted === true ||
        withdrawalRequest.status === WithdrawalRequestStatus.COMPLETED ||
        withdrawalRequest.status === WithdrawalRequestStatus.FAILED
      ) {
        await tx.commit();
        return;
      }

      await this.lockWalletRow(withdrawalRequest.investorProfileId, tx);
      const wallet = await this.fetchWalletOrFail(
        withdrawalRequest.investorProfileId,
        tx,
      );
      const amount = this.normalizeAmount(withdrawalRequest.amount);
      const blockedBalance = this.normalizeAmount(wallet.blockedBalance);
      const nextBlockedBalance = this.normalizeAmount(
        Math.max(blockedBalance - Math.min(blockedBalance, amount), 0),
      );

      await this.investorEscrowAccountRepository.updateById(
        wallet.id,
        {
          blockedBalance: nextBlockedBalance,
        },
        this.getOptions(tx),
      );

      await this.withdrawalRequestRepository.updateById(
        requestId,
        {
          status: WithdrawalRequestStatus.FAILED,
          remarks: reason,
        },
        this.getOptions(tx),
      );

      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async getWallet(currentUser: UserProfile): Promise<{
    id: string;
    investorProfileId: string;
    currentBalance: number;
    blockedBalance: number;
    availableBalance: number;
    currency: string;
    bankName: string;
    accountHolderName: string;
    accountNumber: string;
  }> {
    const investorProfile = await this.fetchInvestorProfileOrFail(currentUser.id);

    await this.investorEscrowAccountService.getOrCreateActiveEscrowForApprovedInvestor(
      investorProfile.id,
    );

    const wallet = await this.fetchWalletOrFail(investorProfile.id);

    return this.buildWalletSummary(wallet);
  }

  async getWalletHistory(
    currentUser: UserProfile,
  ): Promise<
    Array<{
      type: string;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      referenceType: string;
      referenceId: string;
      createdAt: Date | undefined;
    }>
  > {
    const investorProfile = await this.fetchInvestorProfileOrFail(currentUser.id);

    const ledgerRows = await this.investorEscrowLedgerRepository.find({
      where: {
        and: [{investorId: investorProfile.id}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
      fields: {
        type: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
      },
    });

    return ledgerRows.map(row => ({
      type: row.type,
      amount: this.normalizeAmount(row.amount),
      balanceBefore: this.normalizeAmount(row.balanceBefore),
      balanceAfter: this.normalizeAmount(row.balanceAfter),
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      createdAt: row.createdAt,
    }));
  }

  async addFunds(
    currentUser: UserProfile,
    amount: number,
    remarks?: string,
    idempotencyPayload: {idempotencyKey?: string; externalTransactionId?: string} = {},
  ): Promise<{
    wallet: {
      id: string;
      investorProfileId: string;
      currentBalance: number;
      blockedBalance: number;
      availableBalance: number;
      currency: string;
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
    };
    transactionId: string;
  }> {
    const normalizedAmount = this.normalizeAmount(amount);
    const normalizedIdempotencyKey = this.resolveDepositIdempotencyKey(
      idempotencyPayload,
    );

    if (normalizedAmount <= 0) {
      throw new HttpErrors.BadRequest('Deposit amount must be greater than zero');
    }

    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const investorProfile = await this.fetchInvestorProfileOrFail(currentUser.id, tx);

      await this.investorEscrowAccountService.getOrCreateActiveEscrowForApprovedInvestor(
        investorProfile.id,
        tx,
      );

      if (normalizedIdempotencyKey) {
        await this.lockDepositIdempotencyKey(
          investorProfile.id,
          normalizedIdempotencyKey,
          tx,
        );

        const existingDepositLedger =
          await this.fetchExistingSuccessfulDepositByIdempotencyKey(
            investorProfile.id,
            normalizedIdempotencyKey,
            tx,
          );

        if (existingDepositLedger) {
          const existingWallet = await this.fetchWalletOrFail(investorProfile.id, tx);
          const existingResult =
            this.extractDepositResultFromLedgerMetadata(existingDepositLedger);
          const existingTransactionId = String(
            existingResult?.transactionId ?? existingDepositLedger.transactionId ?? '',
          ).trim();

          if (!existingTransactionId) {
            throw new HttpErrors.Conflict(
              'Existing idempotent deposit is missing transactionId',
            );
          }

          await tx.commit();

          if (existingResult?.wallet) {
            return {
              wallet: existingResult.wallet,
              transactionId: existingTransactionId,
            };
          }

          return this.buildDepositResponse(existingWallet, existingTransactionId);
        }
      }

      await this.lockWalletRow(investorProfile.id, tx);
      const wallet = await this.fetchWalletOrFail(investorProfile.id, tx);

      const balanceBefore = this.normalizeAmount(wallet.currentBalance);
      const blockedBalance = this.normalizeAmount(wallet.blockedBalance);
      const balanceAfter = this.normalizeAmount(balanceBefore + normalizedAmount);
      const transactionId = uuidv4();
      const walletAfterCredit = {
        ...wallet,
        currentBalance: balanceAfter,
        blockedBalance,
      } as InvestorEscrowAccount;
      const referenceType = normalizedIdempotencyKey
        ? 'DEPOSIT_IDEMPOTENCY'
        : 'DEPOSIT';
      const referenceId = normalizedIdempotencyKey ?? transactionId;
      const depositResult = this.buildDepositResponse(
        walletAfterCredit,
        transactionId,
      );

      await this.investorEscrowAccountRepository.updateById(
        wallet.id,
        {
          currentBalance: balanceAfter,
          blockedBalance,
        },
        this.getOptions(tx),
      );

      await this.investorEscrowLedgerRepository.create(
        {
          id: uuidv4(),
          investorEscrowAccountId: wallet.id,
          investorId: investorProfile.id,
          type: InvestorEscrowLedgerType.DEPOSIT,
          amount: normalizedAmount,
          balanceBefore,
          balanceAfter,
          status: InvestorEscrowLedgerStatus.SUCCESS,
          transactionId,
          referenceType,
          referenceId,
          remarks,
          metadata: {
            kind: 'DEPOSIT',
            idempotencyKey: normalizedIdempotencyKey,
            amount: normalizedAmount,
            walletId: wallet.id,
            depositResult,
          },
          isDeleted: false,
        },
        this.getOptions(tx),
      );

      await tx.commit();

      const updatedWallet = await this.fetchWalletOrFail(investorProfile.id);

      return this.buildDepositResponse(updatedWallet, transactionId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async requestWithdrawal(
    currentUser: UserProfile,
    amount: number,
    remarks?: string,
  ): Promise<WithdrawalRequest> {
    const normalizedAmount = this.normalizeAmount(amount);

    if (normalizedAmount <= 0) {
      throw new HttpErrors.BadRequest('Withdrawal amount must be greater than zero');
    }

    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const investorProfile = await this.fetchInvestorProfileOrFail(currentUser.id, tx);

      await this.investorEscrowAccountService.getOrCreateActiveEscrowForApprovedInvestor(
        investorProfile.id,
        tx,
      );

      await this.lockWalletRow(investorProfile.id, tx);
      const wallet = await this.fetchWalletOrFail(investorProfile.id, tx);

      const currentBalance = this.normalizeAmount(wallet.currentBalance);
      const blockedBalance = this.normalizeAmount(wallet.blockedBalance);
      const availableBalance = this.normalizeAmount(currentBalance - blockedBalance);

      if (availableBalance < normalizedAmount) {
        throw new HttpErrors.BadRequest('Insufficient available wallet balance');
      }

      const nextBlockedBalance = this.normalizeAmount(blockedBalance + normalizedAmount);

      if (nextBlockedBalance > currentBalance) {
        throw new HttpErrors.BadRequest('Blocked balance cannot exceed current balance');
      }

      await this.investorEscrowAccountRepository.updateById(
        wallet.id,
        {
          blockedBalance: nextBlockedBalance,
        },
        this.getOptions(tx),
      );

      const withdrawalRequest = await this.withdrawalRequestRepository.create(
        {
          id: uuidv4(),
          investorProfileId: investorProfile.id,
          amount: normalizedAmount,
          status: WithdrawalRequestStatus.PENDING,
          requestedAt: new Date(),
          remarks,
          isDeleted: false,
        },
        this.getOptions(tx),
      );

      await tx.commit();
      return withdrawalRequest;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async processWithdrawal(requestId: string): Promise<WithdrawalRequest> {
    const precheckRequest = await this.withdrawalRequestRepository.findById(requestId);

    if (precheckRequest.isDeleted) {
      throw new HttpErrors.NotFound('Withdrawal request not found');
    }

    if (precheckRequest.status !== WithdrawalRequestStatus.PENDING) {
      throw new HttpErrors.BadRequest('Withdrawal request is not pending');
    }

    const tx = await this.datasource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      await this.lockWithdrawalRequestRow(requestId, tx);
      const withdrawalRequest = await this.withdrawalRequestRepository.findById(
        requestId,
        undefined,
        this.getOptions(tx),
      );

      if (withdrawalRequest.isDeleted) {
        throw new HttpErrors.NotFound('Withdrawal request not found');
      }

      if (withdrawalRequest.status !== WithdrawalRequestStatus.PENDING) {
        throw new HttpErrors.BadRequest('Withdrawal request is not pending');
      }

      await this.withdrawalRequestRepository.updateById(
        withdrawalRequest.id,
        {
          status: WithdrawalRequestStatus.PROCESSING,
        },
        this.getOptions(tx),
      );

      await this.lockWalletRow(withdrawalRequest.investorProfileId, tx);
      const wallet = await this.fetchWalletOrFail(
        withdrawalRequest.investorProfileId,
        tx,
      );

      const amount = this.normalizeAmount(withdrawalRequest.amount);

      if (amount <= 0) {
        throw new HttpErrors.BadRequest('Withdrawal amount must be greater than zero');
      }

      const balanceBefore = this.normalizeAmount(wallet.currentBalance);
      const blockedBalanceBefore = this.normalizeAmount(wallet.blockedBalance);

      if (blockedBalanceBefore < amount) {
        throw new HttpErrors.Conflict('Blocked balance does not cover withdrawal amount');
      }

      const nextCurrentBalance = this.normalizeAmount(balanceBefore - amount);
      const nextBlockedBalance = this.normalizeAmount(blockedBalanceBefore - amount);
      const balanceAfter = nextCurrentBalance;

      if (nextCurrentBalance < 0 || nextBlockedBalance < 0) {
        throw new HttpErrors.Conflict('Wallet balance cannot become negative');
      }

      const transactionId = uuidv4();

      await this.investorEscrowAccountRepository.updateById(
        wallet.id,
        {
          currentBalance: nextCurrentBalance,
          blockedBalance: nextBlockedBalance,
        },
        this.getOptions(tx),
      );

      await this.investorEscrowLedgerRepository.create(
        {
          id: uuidv4(),
          investorEscrowAccountId: wallet.id,
          investorId: withdrawalRequest.investorProfileId,
          type: InvestorEscrowLedgerType.WITHDRAWAL_DEBIT,
          amount,
          balanceBefore,
          balanceAfter,
          status: InvestorEscrowLedgerStatus.SUCCESS,
          transactionId,
          referenceType: 'WITHDRAWAL',
          referenceId: withdrawalRequest.id,
          remarks: withdrawalRequest.remarks,
          isDeleted: false,
        },
        this.getOptions(tx),
      );

      // Simulate external bank transfer success.

      await this.withdrawalRequestRepository.updateById(
        withdrawalRequest.id,
        {
          status: WithdrawalRequestStatus.COMPLETED,
          processedAt: new Date(),
        },
        this.getOptions(tx),
      );

      await tx.commit();

      return await this.withdrawalRequestRepository.findById(requestId);
    } catch (error) {
      await tx.rollback();

      await this.failWithdrawalAndReleaseBlock(
        requestId,
        error instanceof Error
          ? error.message
          : 'Unknown withdrawal processing error',
      );

      throw error;
    }
  }
}
