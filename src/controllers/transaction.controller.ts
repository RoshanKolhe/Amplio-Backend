/* eslint-disable @typescript-eslint/no-explicit-any */
import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  get,
  HttpErrors,
  param,
  patch,
  requestBody,
  response,
} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {authorize} from '../authorization';
import {Transaction} from '../models';
import {PspRepository, TransactionRepository} from '../repositories';

function getDisplayStatus(transaction: Transaction) {
  if (!transaction.settlementDate || transaction.status !== 'captured') {
    return transaction.status;
  }

  const settlementDate = new Date(transaction.settlementDate);
  const now = new Date();

  if (Number.isNaN(settlementDate.getTime())) {
    return transaction.status;
  }

  return now.getTime() >= settlementDate.getTime() ? 'paid' : transaction.status;
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
  ) { }

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
    @param.filter(Transaction) filter?: Filter<Transaction>,
  ): Promise<Transaction[]> {
    const transactions = await this.transactionRepository.find({
      ...filter,
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
      transaction.status = getDisplayStatus(transaction);
      return transaction;
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

  const merchantPsps = await this.pspRepository.find({
    where: {
      and: [{usersId: currentUser.id}, {isDeleted: false}],
    },
    fields: {id: true},
  });

  if (!merchantPsps.length) {
    throw new HttpErrors.NotFound('No PSP found');
  }

  const pspIds = merchantPsps.map(p => p.id);

  const transactions = await this.transactionRepository.find({
    where: {
      pspId: {inq: pspIds},
      status: 'captured',
      isDeleted: false,
    },
    order: ['createdAt ASC'],
  });

  if (!transactions.length) {
    throw new HttpErrors.NotFound('No transactions found');
  }

  const todayTransactions = transactions.filter(t => {
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
}
