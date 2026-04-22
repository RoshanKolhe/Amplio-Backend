import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Psp} from './psp.model';
import {Spv} from './spv.model';

@model({
  settings: {
    postgresql: {
      table: 'transactions',
      schema: 'public',
    },
  },
})
export class Transaction extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({
    type: 'string',
    required: true,
  })
  tnsId: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  amount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  totalRecieved: number;

  @property({
    type: 'string',
    default: 'INR',
  })
  currency?: string;

  @property({
    type: 'string',
    jsonSchema: {
      enum: ['notfunded', 'fundeed'],
    },
    default: 'notfunded',
  })
  status?: string; // platform status kept for backward compatibility

  @property({
    type: 'string',
    jsonSchema: {
      enum: [
        'created',
        'authorized',
        'captured',
        'failed',
        'refunded',
        'paid',
      ],
    },
  })
  pspStatus?: string;

  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^(PENDING|SETTLED|FAILED|T_PLUS_[1-9][0-9]*)$',
    },
  })
  pspSettlementStatus?: string;

  @property({
    type: 'string',
  })
  orderId?: string;

  @property({
    type: 'string',
  })
  method?: string;  // upi //netbanking // card

  @property({
    type: 'number',
    required: true,
    postgresql: {
      dataType: 'float'
    }
  })
  amountRefund?: number;


  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  haircut?: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  netAmount?: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  requestReceivableAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  releasedAmount: number;

  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      errorMessage: 'eligibleBusinessDate must be YYYY-MM-DD',
    },
  })
  eligibleBusinessDate?: string;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  riskScore?: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  delayRisk?: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float'
    }
  })
  chargebackRisk?: number;

  @property({
    type: 'string',
  })
  amountRefundStatus?: string;

  @property({
    type: 'boolean',
    default: false,
  })
  captured?: boolean;



  @property({
    type: 'string',
  })
  cardId?: string;

  @property({
    type: 'string',
  })
  bank?: string;

  @property({
    type: 'string',
    postgresql: {
      dataType: 'float'
    }
  })
  fee?: string;

  @property({
    type: 'string',
    postgresql: {
      dataType: 'float'
    }
  })
  tax?: string;

  @property({
    type: 'string',
  })
  vpa?: string;

  @property({
    type: 'object',
    postgresql: {
      dataType: 'jsonb',
    },
  })
  upi?: object;

  @property({
    type: 'object',
  })
  acquirerData?: object;

  @property({
    type: 'date',
  })
  settlementDate?: Date;

  @property({
    type: 'date',
  })
  lastReleasedAt?: Date;

  @property({
    type: 'string',
  })
  settlementMethod?: string;     // T+1 //T+2 //T+3 this will decide by the date gap by createdAt or settlementDate

  @belongsTo(() => Psp)
  pspId: string;

  @belongsTo(() => Spv)
  spvId?: string;

  @property({
    type: 'boolean',
    default: false,
  })
  isInPool?: boolean;

  @property({
    type: 'date',
  })
  poolAddedAt?: Date;

  @property({
    type: 'boolean',
    default: true,
  })
  isActive?: boolean;

  @property({
    type: 'boolean',
    default: false,
  })
  isDeleted?: boolean;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  createdAt?: Date;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  updatedAt?: Date;

  @property({
    type: 'date',
  })
  deletedAt?: Date;

  @property({
    type: 'string',
  })
  createdBy?: string;


  @property({
    type: 'string',
  })
  updatedBy?: string;

  @property({
    type: 'string',
  })
  deletedBy?: string;

  constructor(data?: Partial<Transaction>) {
    super(data);
  }
}

export interface TransactionRelations { }

export type TransactionWithRelations = Transaction & TransactionRelations;
