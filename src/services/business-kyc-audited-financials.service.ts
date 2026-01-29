/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {BusinessKycAuditedFinancials} from '../models';
import {BusinessKycAuditedFinancialsRepository} from '../repositories';

type ReplaceResult = {
  financialDetails: BusinessKycAuditedFinancials[];
  isUpdated: boolean;
};

type AuditedFinancialInput = Omit<BusinessKycAuditedFinancials, 'id'>;

type AuditedFinancialHandler = (
  businessKycId: string,
  records: AuditedFinancialInput[],
  tx: any,
) => Promise<ReplaceResult>;

export class BusinessKycAuditedFinancialsService {
  constructor(
    @repository(BusinessKycAuditedFinancialsRepository)
    private auditedRepo: BusinessKycAuditedFinancialsRepository,
  ) { }

  async createOrUpdateAuditedFinancials(
    businessKycId: string,
    records: AuditedFinancialInput[],
    tx: any,
  ): Promise<{
    auditedFinancials: BusinessKycAuditedFinancials[];
    isUpdated: boolean;
  }> {
    if (!records?.length) {
      throw new HttpErrors.BadRequest(
        'Audited financial details are required',
      );
    }

    const category = records[0].category;

    if (!records.every(r => r.category === category)) {
      throw new HttpErrors.BadRequest('Mixed categories are not allowed');
    }

    const handler = this.categoryHandlers[category];

    if (!handler) {
      throw new HttpErrors.BadRequest(
        `Unsupported audited financial category: ${category}`,
      );
    }

    const result = await handler(businessKycId, records, tx);

    return {
      auditedFinancials: result.financialDetails,
      isUpdated: result.isUpdated,
    };
  }

  private readonly categoryHandlers: Record<string, AuditedFinancialHandler> = {
    financial_statements: this.replaceFinancialStatements.bind(this),
    income_tax_returns: this.replaceIncomeTaxReturns.bind(this),
    gstr_9: this.replaceGSTR9.bind(this),
    gst_3b: this.replaceGST3B.bind(this),
  };

  private replaceFinancialStatements(
    businessKycId: string,
    records: AuditedFinancialInput[],
    tx: any,
  ) {
    return this.replaceGenericAuditedRecords(
      businessKycId,
      records,
      'financial_statements',
      tx,
    );
  }

  private replaceIncomeTaxReturns(
    businessKycId: string,
    records: AuditedFinancialInput[],
    tx: any,
  ) {
    return this.replaceGenericAuditedRecords(
      businessKycId,
      records,
      'income_tax_returns',
      tx,
    );
  }

  private replaceGSTR9(
    businessKycId: string,
    records: AuditedFinancialInput[],
    tx: any,
  ) {
    return this.replaceGenericAuditedRecords(
      businessKycId,
      records,
      'gstr_9',
      tx,
    );
  }

  private replaceGST3B(
    businessKycId: string,
    records: AuditedFinancialInput[],
    tx: any,
  ) {
    return this.replaceGenericAuditedRecords(
      businessKycId,
      records,
      'gst_3b',
      tx,
    );
  }

  private async replaceGenericAuditedRecords(
    businessKycId: string,
    records: AuditedFinancialInput[],
    category: string,
    tx: any,
  ): Promise<ReplaceResult> {
    const {
      baseFinancialStartYear,
      baseFinancialEndYear,
    } = records[0];

    for (const record of records) {
      if (record.type === 'year_wise' && (!record.periodStartYear || !record.periodEndYear)) {
        throw new HttpErrors.BadRequest(
          'Period start year and end year are required',
        );
      }

      if (record.type === 'month_wise' && !record.month) {
        throw new HttpErrors.BadRequest(
          'Month is required for month-wise records',
        );
      }

      if (record.type === 'year_wise' && record.month) {
        throw new HttpErrors.BadRequest(
          'Month is not allowed for year-wise records',
        );
      }

      if (record.category !== category) {
        throw new HttpErrors.BadRequest(
          `Invalid category in payload. Expected ${category}`,
        );
      }
    }

    // category-specific domain rules
    this.applyCategoryRules(category, records);

    const existingRecords = await this.auditedRepo.find({
      where: {
        businessKycId: businessKycId,
        category,
        baseFinancialStartYear,
        baseFinancialEndYear,
        isActive: true,
        isDeleted: false,
      },
    }, {transaction: tx});

    const existingMap = new Map<string, BusinessKycAuditedFinancials>();
    for (const row of existingRecords) {
      const key = this.buildPeriodKey(
        row.periodStartYear,
        row.periodEndYear,
        row.month,
      );
      existingMap.set(key, row);
    }

    let isUpdated = false;

    const operations = records.map(record => {
      const key = this.buildPeriodKey(
        record.periodStartYear,
        record.periodEndYear,
        record.month,
      );

      const existing = existingMap.get(key);

      if (existing) {
        isUpdated = true;
        return this.auditedRepo.updateById(
          existing.id,
          {
            ...record,
            updatedAt: new Date(),
          },
          {transaction: tx},
        );
      }

      return this.auditedRepo.create(
        {
          ...record,
          mode: 1,
          status: 1,
          businessKycId: businessKycId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {transaction: tx},
      );
    });

    await Promise.all(operations);

    const finalRecords = await this.auditedRepo.find({
      where: {
        businessKycId: businessKycId,
        category,
        baseFinancialStartYear,
        baseFinancialEndYear,
        isActive: true,
        isDeleted: false,
      },
      order: ['periodStartYear ASC', 'month ASC'],
    });

    return {
      financialDetails: finalRecords,
      isUpdated,
    };
  }

  private applyCategoryRules(
    category: string,
    records: AuditedFinancialInput[],
  ): void {
    switch (category) {
      case 'financial_statements':
      case 'income_tax_returns':
      case 'gstr_9':
        if (records.some(r => r.type !== 'year_wise')) {
          throw new HttpErrors.BadRequest(
            `${category} must be year-wise`,
          );
        }
        break;

      case 'gst_3b':
        if (records.some(r => r.type !== 'month_wise')) {
          throw new HttpErrors.BadRequest(
            'GST 3B must be month-wise',
          );
        }
        break;

      default:
        throw new HttpErrors.BadRequest(
          `Unsupported audited financial category: ${category}`,
        );
    }
  }

  private buildPeriodKey(
    startYear?: number,
    endYear?: number,
    month?: string,
  ): string {
    return `${startYear}-${endYear}-${month ?? 'NA'}`;
  }

  // fetch audited financials...
  async fetchAuditedFinancials(businessKycId: string): Promise<{
    financialStatements: BusinessKycAuditedFinancials[];
    incomeTaxReturns: BusinessKycAuditedFinancials[];
    gstr9: BusinessKycAuditedFinancials[];
    gst3b: BusinessKycAuditedFinancials[];
  }> {
    const financialStatements = await this.auditedRepo.find({
      where: {
        and: [
          {businessKycId: businessKycId},
          {category: 'financial_statements'},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'file', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}}
      ]
    });

    const incomeTaxReturns = await this.auditedRepo.find({
      where: {
        and: [
          {businessKycId: businessKycId},
          {category: 'income_tax_returns'},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'file', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}}
      ]
    });

    const gstr9 = await this.auditedRepo.find({
      where: {
        and: [
          {businessKycId: businessKycId},
          {category: 'gstr_9'},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'file', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}}
      ]
    });

    const gst3b = await this.auditedRepo.find({
      where: {
        and: [
          {businessKycId: businessKycId},
          {category: 'gst_3b'},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'file', scope: {fields: {id: true, fileOriginalName: true, fileUrl: true}}}
      ]
    });

    return {
      financialStatements,
      incomeTaxReturns,
      gstr9,
      gst3b
    }
  }
}
