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
    type: 'object',
    postgresql: {dataType: 'jsonb'},
    jsonSchema: {
      type: 'object',
      properties: {
        baseDate: {type: 'string'},
        financialStatements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              periodStartYear: {type: 'number'},
              periodEndYear: {type: 'number'},
              amount: {
                anyOf: [
                  {type: 'number'},
                  {type: 'string'},
                ],
              },
            },
            required: ['periodStartYear', 'periodEndYear', 'amount'],
          },
        },
      },
    },
  })
  auditedFinancials?: {
    baseDate: string | Date;
    financialStatements: Array<{
      periodStartYear: number;
      periodEndYear: number;
      amount: number | string;
    }>;
  };

  @property({
     type: 'object',
     postgresql: {dataType: 'jsonb'},
     jsonSchema: {
       type: 'object',
       properties: {
         cashAndBankBalance: {type: 'string'},
         cashAndBankBalanceDate: {type: 'string', format: 'date-time'},
         inventoryAmount: {type: 'string'},
         prepaidExpensesAmount: {type: 'string'},
         otherCurrentAssetsAmount: {type: 'string'},
         currentAssets: {type: 'string'},
         quickAssets: {type: 'string'},
         totalAssets: {type: 'string'},
         currentLiabilitiesAmount: {type: 'string'},
         currentAssetsAndLiabilitiesDate: {type: 'string', format: 'date-time'}
       },
     },
   })
   fundPosition?: {
     cashAndBankBalance: string;
     cashAndBankBalanceDate: string | Date;
     inventoryAmount: string;
     prepaidExpensesAmount: string;
     otherCurrentAssetsAmount: string;
     currentAssets: string;
     quickAssets: string;
     totalAssets: string;
     currentLiabilitiesAmount: string;
     currentAssetsAndLiabilitiesDate: string | Date;
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
        // EBIDTA: {type: 'number'},
      },
    },
  })
  profitabilityDetails?: {
    netProfit: number;
    // EBIDTA: number;
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
        // debtServiceCoverageRatio: {type: 'number'},
        returnOnAssets: {type: 'number'},
      },
    },
  })
  financialRatios?: {
    debtEquityRatio: number;
    currentRatio: number;
    netWorth: number;
    quickRatio: number;
    returnOnEquity: number;
    // debtServiceCoverageRatio: number;
    returnOnAssets: number;
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
