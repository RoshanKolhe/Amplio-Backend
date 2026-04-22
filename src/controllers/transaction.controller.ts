/* eslint-disable @typescript-eslint/no-explicit-any */
import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  get,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {authorize} from '../authorization';
import {Transaction} from '../models';
import {PspRepository, TransactionRepository} from '../repositories';
import {EscrowService} from '../services/escrow.service';
import {PoolService} from '../services/pool.service';
import {isSettlementEligibleForDiscounting} from '../utils/transactions';

const MERCHANT_FUNDED_STATUS = 'fundeed';
const MERCHANT_NOT_FUNDED_STATUS = 'notfunded';

function getPlatformStatus(transaction: Transaction) {
  if (
    transaction.status === MERCHANT_FUNDED_STATUS ||
    Number(transaction.releasedAmount ?? 0) > 0 ||
    transaction.lastReleasedAt
  ) {
    return MERCHANT_FUNDED_STATUS;
  }

  return MERCHANT_NOT_FUNDED_STATUS;
}

function getPspStatus(transaction: Transaction) {
  if (transaction.pspStatus) {
    return transaction.pspStatus;
  }

  if (
    transaction.status !== MERCHANT_FUNDED_STATUS &&
    transaction.status !== MERCHANT_NOT_FUNDED_STATUS
  ) {
    return transaction.status;
  }

  return undefined;
}

function getLegacyDisplayStatus(transaction: Transaction) {
  const paymentStatus = getPspStatus(transaction);

  if (!transaction.settlementDate || paymentStatus !== 'captured') {
    return paymentStatus ?? transaction.status;
  }

  const settlementDate = new Date(transaction.settlementDate);
  const now = new Date();

  if (Number.isNaN(settlementDate.getTime())) {
    return paymentStatus ?? transaction.status;
  }

  return now.getTime() >= settlementDate.getTime() ? 'paid' : paymentStatus;
}

function remapLegacyStatusWhere(where: unknown): unknown {
  if (Array.isArray(where)) {
    return where.map(item => remapLegacyStatusWhere(item));
  }

  if (!where || typeof where !== 'object') {
    return where;
  }

  const remappedWhere: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === 'platformStatus') {
      remappedWhere.status = remapLegacyStatusWhere(value);
      continue;
    }

    if (key === 'status') {
      // Keep old clients working: `where.status` still targets PSP payment status.
      remappedWhere.pspStatus = remapLegacyStatusWhere(value);
      continue;
    }

    remappedWhere[key] = remapLegacyStatusWhere(value);
  }

  return remappedWhere;
}

// function generateTransactions(count = 60) {
//   const transactions = [];

//   for (let i = 1; i <= count; i++) {
//     const method = methods[i % 3];

//     const createdAt = new Date(2026, 2, 20, 10, i % 60);

//     const psp = psps[Math.floor(Math.random() * psps.length)];
//     const bank = banks[Math.floor(Math.random() * banks.length)];
//     const statusPayment = status[Math.floor(Math.random() * status.length)];

//     transactions.push({
//       id: i,
//       payment_id: `pay_${String(i).padStart(3, "0")}`,
//       order_id: `order_${String(i).padStart(3, "0")}`,
//       amount: Math.floor(Math.random() * 300000) + 50000,
//       currency: "INR",

//       psp: psp,
//       bank: bank,

//       payment_method: method,
//       status: statusPayment,
//       reference_id: `${method.toUpperCase()}REF${i}`,
//       rrn: `100000000${String(i).padStart(3, "0")}`,
//       captured_at: createdAt.toISOString(),
//     });
//   }

//   return transactions;
// }

export class TransactionController {
  constructor(
    @repository(TransactionRepository)
    public transactionRepository: TransactionRepository,
    @repository(PspRepository)
    public pspRepository: PspRepository,
    @inject('service.pool.service')
    private poolService: PoolService,
    @inject('service.escrow.service')
    private escrowService: EscrowService,
  ) { }

  private async getCurrentMerchantPspIds(usersId: string) {
    const merchantPsps = await this.pspRepository.find({
      where: {
        and: [
          {usersId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      fields: {id: true},
    });

    return merchantPsps.map(psp => psp.id);
  }

  // @post('/transactions/seed')
  // @response(200, {
  //   description: 'Seed transactions',
  // })
  // async seedTransactions(): Promise<object> {

  //   const data = generateTransactions(60);

  //   const mappedData = data.map(txn => ({
  //     id: uuidv4(),
  //     paymentId: txn.payment_id,
  //     orderId: txn.order_id,
  //     amount: txn.amount,
  //     currency: txn.currency,
  //     psp: txn.psp,
  //     bank: txn.bank,

  //     paymentMethod: txn.payment_method,
  //     status: txn.status,
  //     referenceId: txn.reference_id,
  //     rrn: txn.rrn,
  //     capturedAt: txn.captured_at,
  //   }));

  //   await this.transactionRepository.createAll(mappedData);

  //   return {
  //     message: '60 transactions inserted successfully',
  //     count: mappedData.length,
  //   };
  // }



  @authenticate('jwt')
  @authorize({roles: ['merchant']})
  @get('/transactions')
  @response(200, {
    description: 'Get all transactions',
  })
  async find(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @param.filter(Transaction) filter?: Filter<Transaction>,
  ): Promise<Array<Record<string, unknown>>> {
    const pspIds = await this.getCurrentMerchantPspIds(currentUser.id);
    const remappedWhere = remapLegacyStatusWhere(filter?.where);

    if (!pspIds.length) {
      return [];
    }

    const transactions = await this.transactionRepository.find({
      ...filter,
      where: {
        and: [
          {pspId: {inq: pspIds}},
          {isDeleted: false},
          ...(remappedWhere ? [remappedWhere] : []),
        ],
      },
      order: filter?.order ?? ['createdAt DESC'],
      include: [
        ...(filter?.include ?? []), // preserve if any
        {
          relation: 'psp',
          scope: {
            fields: {
              pspMasterId: true,
            },
            include: [
              {
                relation: 'pspMaster',
                scope: {
                  fields: ['name'],
                },
              },
            ],
          },
        },
      ],
    });

    return transactions.map(transaction => {
      const baseTransaction =
        typeof transaction.toJSON === 'function'
          ? transaction.toJSON()
          : transaction;

      return {
        ...baseTransaction,
        platformStatus: getPlatformStatus(transaction),
        pspStatus: getPspStatus(transaction),
        status: getLegacyDisplayStatus(transaction),
      };
    });
  }

@authenticate('jwt')
@authorize({roles: ['merchant']})
@patch('/transactions/request-receivable')
@response(200, {
  description: 'Request receivable amount',
})
async requestReceivableAmount(
  @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,

  @requestBody({
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['requestReceivableAmount'],
          properties: {
            requestReceivableAmount: {type: 'number'},
          },
        },
      },
    },
  })
  body: {requestReceivableAmount: number},
): Promise<any> {

  const {requestReceivableAmount} = body;

  if (!requestReceivableAmount || requestReceivableAmount <= 0) {
    throw new HttpErrors.BadRequest('Invalid request amount');
  }

  const pspIds = await this.getCurrentMerchantPspIds(currentUser.id);

  if (!pspIds.length) {
    throw new HttpErrors.NotFound('No PSP found');
  }

  const transactions = await this.transactionRepository.find({
    where: {
      and: [
        {pspId: {inq: pspIds}},
        {isDeleted: false},
      ],
    },
    order: ['createdAt ASC'],
  });

  const eligibleTransactions = transactions.filter(
    transaction =>
      isSettlementEligibleForDiscounting(transaction.pspSettlementStatus) &&
      transaction.status !== MERCHANT_FUNDED_STATUS,
  );

  if (!eligibleTransactions.length) {
    throw new HttpErrors.NotFound('No transactions found');
  }

  const todayTransactions = eligibleTransactions.filter(t => {
    if (!t.createdAt) return false;

    const d = new Date(t.createdAt);
    const today = new Date();

    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  });

  if (!todayTransactions.length) {
    throw new HttpErrors.BadRequest('No eligible transactions for today');
  }

  const totalNetAmount = todayTransactions.reduce(
    (sum, t) => sum + (t.netAmount ?? 0),
    0,
  );

  const totalRequested = todayTransactions.reduce(
    (sum, t) => sum + (t.requestReceivableAmount ?? 0),
    0,
  );

  const availableBalance = totalNetAmount - totalRequested;

  if (requestReceivableAmount > availableBalance) {
    throw new HttpErrors.BadRequest(
      `Only ${availableBalance} is available`,
    );
  }

  let remaining = requestReceivableAmount;

  for (const txn of todayTransactions) {
    if (remaining <= 0) break;

    const txnAvailable =
      (txn.netAmount ?? 0) - (txn.requestReceivableAmount ?? 0);

    if (txnAvailable <= 0) continue;

    const deduct = Math.min(txnAvailable, remaining);

    await this.transactionRepository.updateById(txn.id, {
      requestReceivableAmount:
        (txn.requestReceivableAmount ?? 0) + deduct,
    });

    remaining -= deduct;
  }

  return {
    success: true,
    message: 'Amount processed successfully',
    requestedAmount: requestReceivableAmount,
    totalNetAmount,
    availableBalance: availableBalance - requestReceivableAmount,
  };
}

  @authenticate('jwt')
  @post('/transactions/funded')
  @response(200, {
    description: 'Create a fundeed transaction and attempt pool inclusion',
  })
  async createFundedTransaction(
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['tnsId', 'amount', 'spvId', 'pspId'],
            properties: {
              tnsId: {type: 'string'},
              amount: {type: 'number'},
              spvId: {type: 'string'},
              pspId: {type: 'string'},
              orderId: {type: 'string'},
              currency: {type: 'string'},
              method: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      tnsId: string;
      amount: number;
      spvId: string;
      pspId: string;
      orderId?: string;
      currency?: string;
      method?: string;
    },
  ): Promise<Record<string, unknown>> {
    if (Number(body.amount) <= 0) {
      throw new HttpErrors.BadRequest('Transaction amount must be greater than zero');
    }

    const psp = await this.pspRepository.findById(body.pspId).catch(() => undefined);

    if (!psp || psp.isDeleted || !psp.isActive) {
      throw new HttpErrors.BadRequest('Active PSP not found');
    }

    const transaction = await this.transactionRepository.create({
      id: uuidv4(),
      tnsId: body.tnsId,
      amount: Number(body.amount),
      totalRecieved: Number(body.amount),
      currency: body.currency ?? 'INR',
      status: MERCHANT_FUNDED_STATUS,
      pspStatus: 'captured',
      pspSettlementStatus: 'PENDING',
      orderId: body.orderId,
      method: body.method,
      amountRefund: 0,
      haircut: 0,
      netAmount: Number(body.amount),
      requestReceivableAmount: 0,
      releasedAmount: Number(body.amount),
      captured: true,
      lastReleasedAt: new Date(),
      pspId: body.pspId,
      spvId: body.spvId,
      isInPool: false,
      isActive: true,
      isDeleted: false,
    });

    const poolResult = await this.poolService.addFundedTransactionToPool(
      transaction.id,
      body.spvId,
    );
    const persistedTransaction = await this.transactionRepository.findById(
      transaction.id,
    );

    return {
      success: true,
      message: poolResult.added
        ? 'Fundeed transaction added to pool'
        : 'Fundeed transaction created but not added to pool',
      transaction: persistedTransaction,
      poolResult,
    };
  }

  @authenticate('jwt')
  @post('/transactions/settled')
  @response(200, {
    description: 'Simulate escrow settlement for a transaction',
  })
  async settleTransactionViaEscrow(
    @requestBody({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['transactionId', 'spvId', 'amount'],
            properties: {
              transactionId: {type: 'string'},
              spvId: {type: 'string'},
              amount: {type: 'number'},
            },
          },
        },
      },
    })
    body: {
      transactionId: string;
      spvId: string;
      amount: number;
    },
  ): Promise<Record<string, unknown>> {
    const result = await this.escrowService.recordEscrowTransaction(body);
    const transaction = await this.transactionRepository.findById(body.transactionId);

    return {
      success: true,
      message: result.settlementApplied
        ? 'Escrow matched and transaction marked settled'
        : 'Escrow recorded but transaction is still pending settlement',
      escrowTransaction: result.escrowTransaction,
      transaction,
    };
  }
}
