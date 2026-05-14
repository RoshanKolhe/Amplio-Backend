import {Entity, model, property} from '@loopback/repository';

export enum EscalationType {
  PAYMENT_DISPUTE = 'PAYMENT_DISPUTE',
  UTR_NOT_VERIFIED = 'UTR_NOT_VERIFIED',
  ALLOCATION_MISSING = 'ALLOCATION_MISSING',
  OTHER = 'OTHER',
}

export enum EscalationStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

@model({
  settings: {
    postgresql: {
      table: 'escalations',
      schema: 'public',
    },
  },
})
export class Escalation extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  // Optional — escalation may be filed before an order exists
  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  orderId?: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  verificationId?: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  investorProfileId: string;

  @property({
    type: 'string',
    postgresql: {dataType: 'uuid'},
  })
  spvId?: string;

  @property({
    type: 'string',
    default: EscalationType.PAYMENT_DISPUTE,
    jsonSchema: {enum: Object.values(EscalationType)},
  })
  escalationType?: string;

  // UTR the investor believes was valid
  @property({type: 'string'})
  utrNumber?: string;

  // Short reason label chosen by investor
  @property({type: 'string', required: true})
  reason: string;

  // Full free-text description
  @property({type: 'string', required: true})
  description: string;

  @property({type: 'string'})
  attachmentUrl?: string;

  @property({
    type: 'string',
    required: true,
    default: EscalationStatus.OPEN,
    jsonSchema: {enum: Object.values(EscalationStatus)},
  })
  status: EscalationStatus;

  @property({type: 'string'})
  resolution?: string;

  @property({type: 'string'})
  resolvedBy?: string;

  @property({type: 'date'})
  resolvedAt?: Date;

  // SLA deadline: createdAt + 2 business days (computed at creation)
  @property({type: 'date'})
  slaDeadlineAt?: Date;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: Date;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: Date;

  @property({type: 'string'})
  createdBy?: string;

  @property({type: 'string'})
  updatedBy?: string;

  constructor(data?: Partial<Escalation>) {
    super(data);
  }
}

export interface EscalationRelations {}

export type EscalationWithRelations = Escalation & EscalationRelations;
