import {belongsTo, Entity, model, property} from '@loopback/repository';
import {BusinessKyc} from './business-kyc.model';
import {CompanyProfiles} from './company-profiles.model';

@model({
  settings: {
    postgresql: {
      table: 'business_kyc_financials',
      schema: 'public',
    },
  },
})
export class BusinessKycFinancial extends Entity {

  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id?: string;

  @property({
    type: 'array',
    postgresql: {dataType: 'jsonb'},
    itemType: 'object',
    jsonSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          year: {type: 'string'},
          amount: {type: 'number'},
        },
      },
    },
  })
  auditedFinancials?: {
    year: string;
    amount?: number;
  }[];

  @property({
    type: 'object',
    postgresql: {dataType: 'jsonb'},
    jsonSchema: {
      type: 'object',
      properties: {
        cashBalance: {type: 'string'},
        cashBalanceDate: {type: 'string', format: 'date-time'},
        bankBalance: {type: 'string'},
        bankBalanceDate: {type: 'string', format: 'date-time'},
      },
    },
  })
  fundPosition?: {
    cashBalance: string;
    cashBalanceDate: string | Date;
    bankBalance: string;
    bankBalanceDate: string | Date;
  };

  @property({
    type: 'object',
    postgresql: {dataType: 'jsonb'},
    jsonSchema: {
      type: 'object',
      properties: {
        secured: {
          type: 'number'
        },
        unsecured: {
          type: 'object',
          properties: {
            fromPromoters: {type: 'number'},
            fromOthers: {type: 'number'},
          }
        },
        totalBorrowings: {type: 'number'}
      },
    },
  })
  borrowingDetails?: {
    secured?: number;
    unsecured?: {
      fromPromoters?: number;
      fromOthers?: number;
    };
    totalBorrowings?: number;
  };

  @property({
    type: 'object',
    postgresql: {dataType: 'jsonb'},
    jsonSchema: {
      type: 'object',
      properties: {
        shareCapital: {type: 'number'},
        reserveSurplus: {type: 'number'},
        netWorth: {type: 'number'},
      },
    },
  })
  capitalDetails?: {
    shareCapital: number;
    reserveSurplus: number;
    netWorth: number;
  };

  @property({
    type: 'object',
    postgresql: {dataType: 'jsonb'},
    jsonSchema: {
      type: 'object',
      properties: {
        netProfit: {type: 'number'},
      },
    },
  })
  profitabilityDetails?: {
    netProfit: number;
  };

  @property({
    type: 'object',
    postgresql: {dataType: 'jsonb'},
    jsonSchema: {
      type: 'object',
      properties: {
        debtEquityRatio: {type: 'number'},
        currentRatio: {type: 'number'},
        netWorth: {type: 'number'},
        quickRatio: {type: 'number'},
        returnOnEquity: {type: 'number'},
        debtServiceCoverageRatio: {type: 'number'},
        returnOnAsset: {type: 'number'},
      },
    },
  })
  financialRatios?: {
    debtEquityRatio: number;
    currentRatio: number;
    netWorth: number;
    quickRatio: number;
    returnOnEquity: number;
    debtServiceCoverageRatio: number;
    returnOnAsset: number;
  };

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2], // 0 => under review 1 => approved 2 => rejected
    },
  })
  status: number; // 0 => under review 1 => approved 2 => rejected

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0=auto OCR, 1=manual team verification
    },
  })
  mode: number; // 0 => auto 1 => human

  @property({
    type: 'string',
  })
  reason?: string; // if rejection is there

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

  @belongsTo(() => BusinessKyc)
  businessKycId: string;

  @belongsTo(() => CompanyProfiles)
  companyProfilesId: string;

  constructor(data?: Partial<BusinessKycFinancial>) {
    super(data);
  }
}

export interface BusinessKycFinancialRelations {
  // describe navigational properties here
}

export type BusinessKycFinancialWithRelations = BusinessKycFinancial & BusinessKycFinancialRelations;
