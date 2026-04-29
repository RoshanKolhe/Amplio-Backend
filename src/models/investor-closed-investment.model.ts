import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';
import {PoolFinancials} from './pool-financials.model';
import {Spv} from './spv.model';
import {Users} from './users.model';

export enum InvestorClosedInvestmentStatus {
  CLOSED = 'CLOSED',
}

@model({
  settings: {
    postgresql: {
      table: 'investor_closed_investments',
      schema: 'public',
    },
  },
})
export class InvestorClosedInvestment extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @belongsTo(() => InvestorProfile)
  investorProfileId: string;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => Spv)
  spvId: string;

  @belongsTo(
    () => PoolFinancials,
    {},
    {
      postgresql: {dataType: 'uuid'},
      required: false,
    },
  )
  poolFinancialsId?: string;

  @property({
    type: 'array',
    itemType: 'string',
    required: true,
    postgresql: {dataType: 'varchar[]'},
  })
  ptcIssuanceIds: string[];

  @property({
    type: 'number',
    required: true,
    default: 0,
  })
  totalUnits: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  totalInvestedAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  totalRedeemedAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  principalPayout: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  interestPayout: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  grossPayout: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  netPayout: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  capitalGain: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 20,
      scale: 2,
    },
  })
  stampDutyAmount: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'numeric',
      precision: 10,
      scale: 4,
    },
  })
  annualInterestRate: number;

  @property({
    type: 'date',
    required: true,
  })
  startDate: Date;

  @property({
    type: 'date',
    required: true,
    defaultFn: 'now',
  })
  closedAt: Date;

  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  redemptionLedgerId?: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  redemptionRequestId?: string;

  @property({
    type: 'string',
  })
  transactionId?: string;

  @property({
    type: 'string',
    required: true,
    default: InvestorClosedInvestmentStatus.CLOSED,
    jsonSchema: {
      enum: Object.values(InvestorClosedInvestmentStatus),
    },
  })
  status: InvestorClosedInvestmentStatus;

  @property({
    type: 'object',
    postgresql: {
      dataType: 'jsonb',
    },
  })
  metadata?: object;

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

  constructor(data?: Partial<InvestorClosedInvestment>) {
    super(data);
  }
}

export interface InvestorClosedInvestmentRelations {}

export type InvestorClosedInvestmentWithRelations = InvestorClosedInvestment &
  InvestorClosedInvestmentRelations;
