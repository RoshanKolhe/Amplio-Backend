import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Media} from './media.model';

@model({
  settings: {
    postgresql: {
      table: 'businesskyc_audited_financials',
      schema: 'public',
    },
  },
})
export class BusinessKycAuditedFinancials extends Entity {
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
    jsonSchema: {
      enum: [
        'financial_statements',
        'income_tax_returns',
        'gstr_9',
        'gst_3b'
      ]
    }
  })
  category: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [
        'year_wise',
        'month_wise'
      ]
    }
  })
  type: string;

  @property({
    type: 'number',
    required: true
  })
  baseFinancialStartYear: number;

  @property({
    type: 'number',
    required: true
  })
  baseFinancialEndYear: number;

  @property({
    type: 'number'
  })
  periodStartYear?: number;

  @property({
    type: 'number'
  })
  periodEndYear?: number;

  @property({
    type: 'string',
    jsonSchema: {
      enum: [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ]

    }
  })
  month?: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['audited', 'provisional'],
    },
  })
  auditedType: string;

  @property({
    type: 'string',
    required: true
  })
  auditorName: string;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  reportDate: Date;

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

  // @belongsTo(() => BusinessKycIssueApplication)
  // businesskycIssueApplicationId: string;

  @belongsTo(() => Media)
  fileId: string;

  constructor(data?: Partial<BusinessKycAuditedFinancials>) {
    super(data);
  }
}

export interface BusinessKycAuditedFinancialsRelations {
  // describe navigational properties here
}

export type BusinessKycAuditedFinancialsWithRelations = BusinessKycAuditedFinancials & BusinessKycAuditedFinancialsRelations;
