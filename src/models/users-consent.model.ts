import {Entity, model, property, belongsTo} from '@loopback/repository';
import {ConsentTemplate} from './consent-template.model';

@model()
export class UsersConsent extends Entity {

  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  identifierId: string;

  @property({
    type: 'date',
    default: () => new Date(),
  })
  acceptedAt: Date;

  @property({
    type: 'string',
  })
  ipAddress?: string;

  @property({
    type: 'string',
  })
  userAgent?: string;

  @property({
    type: 'date',
  })
  verifiedAt?: Date;

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

  @belongsTo(() => ConsentTemplate)
  consentTemplateId: string;

  constructor(data?: Partial<UsersConsent>) {
    super(data);
  }
}

export interface UsersConsentRelations {
  // describe navigational properties here
}

export type UsersConsentWithRelations = UsersConsent & UsersConsentRelations;
