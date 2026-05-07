import {inject} from '@loopback/core';
import {IsolationLevel, Options, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {
  EscrowTransactionDirection,
  EscrowTransactionType,
  InvestorEscrowLedgerStatus,
  InvestorEscrowLedgerType,
} from '../models';
import {InvestorEscrowLedgerRepository} from '../repositories';
import {EscrowService} from './escrow.service';

type BaseMovementPayload = {
  investorEscrowAccountId: string;
  investorId: string;
  spvId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionId: string;
  referenceType: string;
  referenceId: string;
  remarks?: string;
  metadata?: object;
  createdBy?: string;
};

export class EscrowMovementService {
  constructor(
    @repository(InvestorEscrowLedgerRepository)
    private investorEscrowLedgerRepository: InvestorEscrowLedgerRepository,
    @inject('service.escrow.service')
    private escrowService: EscrowService,
  ) {}

  private getOptions(tx?: unknown): Options | undefined {
    return tx ? {transaction: tx} : undefined;
  }

  private normalizeAmount(value: number | undefined | null): number {
    return Number(Number(value ?? 0).toFixed(2));
  }

  private ensureTransactionContext(tx: unknown): void {
    if (!tx) {
      throw new HttpErrors.BadRequest(
        'Escrow movement orchestration requires an active transaction context',
      );
    }
  }

  private async createInvestorLedgerEntry(
    payload: BaseMovementPayload & {
      ledgerType: InvestorEscrowLedgerType;
      direction: EscrowTransactionDirection;
      transactionType: EscrowTransactionType;
      referenceMovementId: string;
    },
    tx: unknown,
  ): Promise<{id: string}> {
    const amount = this.normalizeAmount(payload.amount);

    if (amount <= 0) {
      throw new HttpErrors.BadRequest('Escrow movement amount must be greater than zero');
    }

    const ledgerId = uuidv4();

    await this.investorEscrowLedgerRepository.create(
      {
        id: ledgerId,
        investorEscrowAccountId: payload.investorEscrowAccountId,
        investorId: payload.investorId,
        type: payload.ledgerType,
        amount,
        balanceBefore: this.normalizeAmount(payload.balanceBefore),
        balanceAfter: this.normalizeAmount(payload.balanceAfter),
        status: InvestorEscrowLedgerStatus.SUCCESS,
        transactionId: payload.transactionId,
        referenceMovementId: payload.referenceMovementId,
        referenceType: payload.referenceType,
        referenceId: payload.referenceId,
        remarks: payload.remarks,
        metadata: {
          ...(payload.metadata ?? {}),
          transactionType: payload.transactionType,
          direction: payload.direction,
          referenceMovementId: payload.referenceMovementId,
          spvId: payload.spvId,
        },
        createdBy: payload.createdBy,
        updatedBy: payload.createdBy,
        isDeleted: false,
      },
      this.getOptions(tx),
    );

    return {id: ledgerId};
  }

  async recordInvestmentMovement(
    payload: BaseMovementPayload,
    tx: unknown,
  ): Promise<{referenceMovementId: string; investorLedgerId: string}> {
    this.ensureTransactionContext(tx);

    const referenceMovementId = uuidv4();
    const investorLedger = await this.createInvestorLedgerEntry(
      {
        ...payload,
        ledgerType: InvestorEscrowLedgerType.BUY_DEBIT,
        direction: EscrowTransactionDirection.DEBIT,
        transactionType: EscrowTransactionType.INVESTMENT_INFLOW,
        referenceMovementId,
      },
      tx,
    );

    await this.escrowService.createMatchedLedgerEntry(
      {
        transactionId: payload.transactionId,
        spvId: payload.spvId,
        amount: payload.amount,
        transactionType: EscrowTransactionType.INVESTMENT_INFLOW,
        direction: EscrowTransactionDirection.CREDIT,
        referenceMovementId,
      },
      tx,
    );

    return {
      referenceMovementId,
      investorLedgerId: investorLedger.id,
    };
  }

  async recordRedemptionMovement(
    payload: BaseMovementPayload,
    tx: unknown,
  ): Promise<{referenceMovementId: string; investorLedgerId: string}> {
    this.ensureTransactionContext(tx);

    const referenceMovementId = uuidv4();

    await this.escrowService.createMatchedLedgerEntry(
      {
        transactionId: payload.transactionId,
        spvId: payload.spvId,
        amount: payload.amount,
        transactionType: EscrowTransactionType.REDEMPTION_OUTFLOW,
        direction: EscrowTransactionDirection.DEBIT,
        referenceMovementId,
      },
      tx,
    );

    const investorLedger = await this.createInvestorLedgerEntry(
      {
        ...payload,
        ledgerType: InvestorEscrowLedgerType.REDEMPTION_CREDIT,
        direction: EscrowTransactionDirection.CREDIT,
        transactionType: EscrowTransactionType.REDEMPTION_OUTFLOW,
        referenceMovementId,
      },
      tx,
    );

    return {
      referenceMovementId,
      investorLedgerId: investorLedger.id,
    };
  }
}
