import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestmentOrder} from './investment-order.model';
import {InvestorProfile} from './investor-profile.model';
import {Media} from './media.model';
import {Users} from './users.model';

export enum CustomerSupportStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

@model({
  settings: {
    postgresql: {
      table: 'customer_support',
      schema: 'public',
    },
  },
})
export class CustomerSupport extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @belongsTo(() => InvestmentOrder)
  orderId: string;

  @belongsTo(() => InvestorProfile)
  investorProfileId: string;

  @property({
    type: 'string',
    required: true,
  })
  issueType: string;

  @property({
    type: 'string',
    required: true,
  })
  complaintDescription: string;

  @belongsTo(() => Media, {name: 'attachmentMedia'})
  attachmentMediaId?: string;

  @property({
    type: 'string',
    required: true,
    default: CustomerSupportStatus.OPEN,
    jsonSchema: {enum: Object.values(CustomerSupportStatus)},
  })
  status: CustomerSupportStatus;

  @property({
    type: 'string',
  })
  adminResponse?: string;

  @belongsTo(
    () => Users,
    {name: 'superAdmin'},
    {
      postgresql: {dataType: 'uuid'},
    },
  )
  superAdminId?: string;
  

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: Date;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: Date;

  @property({type: 'string'})
  createdBy?: string;

  @property({type: 'string'})
  updatedBy?: string;

  @property({
    type: 'date',
  })
  deletedAt?: Date;

  constructor(data?: Partial<CustomerSupport>) {
    super(data);
  }
}

export interface CustomerSupportRelations {
  order?: InvestmentOrder;
  investorProfile?: InvestorProfile;
  attachmentMedia?: Media;
  superAdmin?: Users;
}

export type CustomerSupportWithRelations = CustomerSupport &
  CustomerSupportRelations;
