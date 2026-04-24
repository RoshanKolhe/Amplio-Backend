import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';
import {PoolFinancials} from './pool-financials.model';
import {PtcIssuance} from './ptc-issuance.model';
import {Spv} from './spv.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'investor_ptc_holdings',
      schema: 'public',
    },
    indexes: {
      uniqueInvestorHoldingByIssuance: {
        keys: {ptcIssuanceId: 1, investorProfileId: 1},
        options: {unique: true},
      },
    },
  },
})
export class InvestorPtcHolding extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @belongsTo(() => PtcIssuance)
  ptcIssuanceId: string;

  @belongsTo(() => InvestorProfile)
  investorProfileId: string;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => Spv)
  spvId: string;

  @belongsTo(() => PoolFinancials)
  poolFinancialsId: string;

  @property({
    type: 'number',
    required: true,
    default: 0,
  })
  ownedUnits: number;

  @property({
    type: 'number',
    required: true,
    default: 0,
    postgresql: {
      dataType: 'float',
    },
  })
  investedAmount: number;

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

  constructor(data?: Partial<InvestorPtcHolding>) {
    super(data);
  }
}

export interface InvestorPtcHoldingRelations {}

export type InvestorPtcHoldingWithRelations = InvestorPtcHolding &
  InvestorPtcHoldingRelations;
