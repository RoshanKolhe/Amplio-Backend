import {inject} from '@loopback/core';
import {v4 as uuidv4} from 'uuid';
import {
  EscrowTransactionDirection,
  EscrowTransactionType,
} from '../models';
import {EscrowService} from './escrow.service';

type BaseMovementPayload = {
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
    @inject('service.escrow.service')
    private escrowService: EscrowService,
  ) {}

  async recordInvestmentMovement(
    payload: BaseMovementPayload,
    tx: unknown,
  ): Promise<{referenceMovementId: string}> {
    const referenceMovementId = uuidv4();

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

    return {referenceMovementId};
  }

  async recordRedemptionMovement(
    payload: BaseMovementPayload,
    tx: unknown,
  ): Promise<{referenceMovementId: string}> {
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

    return {referenceMovementId};
  }
}
