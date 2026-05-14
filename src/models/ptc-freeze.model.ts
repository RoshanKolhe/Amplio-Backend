import {Entity, model, property} from '@loopback/repository';

export enum PtcFreezeStatus {
  ACTIVE = 'ACTIVE',
  CONSUMED = 'CONSUMED',  // Units allocated to investor
  RELEASED = 'RELEASED',  // Freed due to rejection or cancellation
  EXPIRED = 'EXPIRED',    // 30-minute window lapsed without admin action
}

export enum PtcFreezeReason {
  UTR_SUBMITTED = 'UTR_SUBMITTED',
  ADMIN_HOLD = 'ADMIN_HOLD',
}

export enum PtcFreezeReleaseReason {
  ALLOCATED = 'ALLOCATED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@model({
  settings: {
    postgresql: {
      table: 'ptc_freezes',
      schema: 'public',
    },
  },
})
export class PtcFreeze extends Entity {
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
    postgresql: {dataType: 'uuid'},
  })
  orderId: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  verificationId: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  investorProfileId: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  spvId: string;

  // Individual PTC issuance row that was frozen
  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  ptcIssuanceId: string;

  @property({type: 'number', required: true})
  frozenUnits: number;

  @property({
    type: 'string',
    default: PtcFreezeReason.UTR_SUBMITTED,
    jsonSchema: {enum: Object.values(PtcFreezeReason)},
  })
  freezeReason?: string;

  @property({
    type: 'string',
    required: true,
    default: PtcFreezeStatus.ACTIVE,
    jsonSchema: {enum: Object.values(PtcFreezeStatus)},
  })
  status: PtcFreezeStatus;

  @property({type: 'date', defaultFn: 'now'})
  frozenAt?: Date;

  // frozenAt + 30 minutes; enforced by enhanced SpvReservationCron
  @property({type: 'date', required: true})
  expiresAt: Date;

  @property({type: 'date'})
  releasedAt?: Date;

  @property({
    type: 'string',
    jsonSchema: {enum: Object.values(PtcFreezeReleaseReason)},
  })
  releaseReason?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: Date;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: Date;

  @property({type: 'string'})
  createdBy?: string;

  @property({type: 'string'})
  updatedBy?: string;

  constructor(data?: Partial<PtcFreeze>) {
    super(data);
  }
}

export interface PtcFreezeRelations {}

export type PtcFreezeWithRelations = PtcFreeze & PtcFreezeRelations;
