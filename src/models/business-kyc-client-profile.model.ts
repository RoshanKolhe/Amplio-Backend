import {Entity, model, property, belongsTo} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_client_profile',
      schema: 'public',
    },
  },
})
export class BusinessKycClientProfile extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;


  @property({
    type: 'string',
    required: true,
  })
  clientName: string;


  @property({
    type: 'string',
    required: true,
  })
  CIN: string;


  @property({
    type: 'string',
    required: true,
  })
  GSTIN: string;

  @property({
    type: 'number',
    required: true
  })
  turnOvers: number

  @property({
    type: 'number',
    required: true
  })
  avgCreditDays: number

  @property({
    type: 'number',
    required: true
  })
  relationships: number

  @property({
    type: 'number',
    required: true
  })
  avgInvoiceSize: number

  @property({
    type: 'string',
    required: true
  })
  contactDetails: string


  //InvoiceId in remaning here

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

  @belongsTo(() => BusinessKyc)
  businessKycId: string;
  @property({
    type: 'date',
  })
  deletedAt?: Date;

  constructor(data?: Partial<BusinessKycClientProfile>) {
    super(data);
  }
}

export interface BusinessKycClientProfileRelations {
  // describe navigational properties here
}

export type BusinessKycClientProfileWithRelations = BusinessKycClientProfile & BusinessKycClientProfileRelations;
