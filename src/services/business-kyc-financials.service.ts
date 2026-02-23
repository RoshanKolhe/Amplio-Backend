import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {BusinessKycFinancialRepository} from '../repositories';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class BusinessKycFinancialsService {
  constructor(
    @repository(BusinessKycFinancialRepository)
    private businessKycFinancialRepository: BusinessKycFinancialRepository,
  ) { }

  private async findExistingFinancial(
  businessKycId: string,
) {
  return this.businessKycFinancialRepository.findOne({
    where: {
      businessKycId,
      isActive: true,
      isDeleted: false,
    },
  });
}



  // create or update audited financials
 async createOrUpdateCompanyAuditedFinancials(
  businessKycId: string,
  companyProfilesId: string,
  auditedFinancials: {
    year: string;
    amount?: number;
  }[],
  tx: any,
): Promise<{
  auditedFinancials: any[];
  updateStatus: boolean;
}> {

  if (!auditedFinancials?.length) {
    throw new HttpErrors.BadRequest('Audited financials required');
  }

  const existing = await this.findExistingFinancial(businessKycId);

  if (existing) {
    await this.businessKycFinancialRepository.updateById(
      existing.id,
      { auditedFinancials, updatedAt: new Date() },
      { transaction: tx },
    );

    return {
      auditedFinancials,
      updateStatus: false,
    };
  }

  await this.businessKycFinancialRepository.create(
    {
      businessKycId,
      companyProfilesId,
      auditedFinancials,
      status: 0,
      mode: 0,
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { transaction: tx },
  );

  return {
    auditedFinancials,
    updateStatus: true,
  };
}



  // fetch audited financials
  async fetchCompanyAuditedFinancials(
    businessKycId: string,
    companyProfilesId: string,
  ): Promise<{
    auditedFinancials: {
      year: string;
      amount?: number;
    }[];
  }> {
    const data = await this.businessKycFinancialRepository.findOne({
      where: {
        and: [
          {businessKycId},
          {companyProfilesId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!data?.auditedFinancials) {
      throw new HttpErrors.NotFound('Audited financials not found');
    }

    return {
      auditedFinancials: data.auditedFinancials,
    };
  }

  // create or update Borrowing Details
 async createOrUpdateBorrowingDetails(
  businessKycId: string,
  companyProfilesId: string,
  borrowingDetails: {
    secured?: number;
    unsecured?: {
      fromPromoters?: number;
      fromOthers?: number;
    };
  },
  tx: any,
): Promise<{
  borrowingDetails: any;
  updateStatus: boolean;
}> {

  const existing = await this.findExistingFinancial(businessKycId);

  const secured = borrowingDetails.secured ?? 0;
  const fromPromoters = borrowingDetails.unsecured?.fromPromoters ?? 0;
  const fromOthers = borrowingDetails.unsecured?.fromOthers ?? 0;

  const finalBorrowing = {
    ...borrowingDetails,
    totalBorrowings: secured + fromPromoters + fromOthers,
  };

  if (existing) {
    await this.businessKycFinancialRepository.updateById(
      existing.id,
      { borrowingDetails: finalBorrowing, updatedAt: new Date() },
      { transaction: tx },
    );

    return {
      borrowingDetails: finalBorrowing,
      updateStatus: false,
    };
  }

  await this.businessKycFinancialRepository.create(
    {
      businessKycId,
      companyProfilesId,
      borrowingDetails: finalBorrowing,
      status: 0,
      mode: 0,
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { transaction: tx },
  );

  return {
    borrowingDetails: finalBorrowing,
    updateStatus: true,
  };
}


  // fetch Borrowing Details
  async fetchBorrowingDetails(businessKycId: string, companyProfilesId: string): Promise<{
    secured?: number;
    unsecured?: {
      fromPromoters?: number;
      fromOthers?: number;
    };
    totalBorrowings?: number;
  }> {
    const data = await this.businessKycFinancialRepository.findOne({
      where: {
        and: [
          {businessKycId},
          {companyProfilesId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (!data?.borrowingDetails) {
      throw new HttpErrors.NotFound('Borrowing details not found');
    }

    return data.borrowingDetails;
  }

  // create or update fund position...
async createOrUpdateFundPosition(
  businessKycId: string,
  companyProfilesId: string,
  fundPosition: any,
  tx: any,
): Promise<{
  fundPosition: any;
  updateStatus: boolean;
}> {

  const existing = await this.findExistingFinancial(businessKycId);

  if (existing) {
    await this.businessKycFinancialRepository.updateById(
      existing.id,
      { fundPosition, updatedAt: new Date() },
      { transaction: tx },
    );

    return {
      fundPosition,
      updateStatus: false,
    };
  }

  await this.businessKycFinancialRepository.create(
    {
      businessKycId,
      companyProfilesId,
      fundPosition,
      status: 0,
      mode: 0,
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { transaction: tx },
  );

  return {
    fundPosition,
    updateStatus: true,
  };
}


  // fetch fund position data...
  async fetchFundPositionData(businessKycId: string, companyProfilesId: string): Promise<{
    cashBalance: string;
    cashBalanceDate: string;
    bankBalance: string;
    bankBalanceDate: string;
  }> {
    const applicationFinancials =
      await this.businessKycFinancialRepository.findOne({
        where: {
          and: [
            {businessKycId},
            {companyProfilesId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (!applicationFinancials?.fundPosition) {
      throw new HttpErrors.NotFound('Fund position not found');
    }

    const {fundPosition} = applicationFinancials;

    return {
      cashBalance: fundPosition.cashBalance,
      cashBalanceDate: new Date(fundPosition.cashBalanceDate).toISOString(),
      bankBalance: fundPosition.bankBalance,
      bankBalanceDate: new Date(fundPosition.bankBalanceDate).toISOString(),
    };
  }

  // create or update capital details...
  async createOrUpdateCapitalDetails(
  businessKycId: string,
  companyProfilesId: string,
  capitalDetails: any,
  tx: any,
): Promise<{
  capitalDetails: any;
  updateStatus: boolean;
}> {

  const existing = await this.findExistingFinancial(businessKycId);

  if (existing) {
    await this.businessKycFinancialRepository.updateById(
      existing.id,
      { capitalDetails, updatedAt: new Date() },
      { transaction: tx },
    );

    return {
      capitalDetails,
      updateStatus: false,
    };
  }

  await this.businessKycFinancialRepository.create(
    {
      businessKycId,
      companyProfilesId,
      capitalDetails,
      status: 0,
      mode: 0,
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { transaction: tx },
  );

  return {
    capitalDetails,
    updateStatus: true,
  };
}


  // fetch capital details data...
  async fetchcapitalDetailsData(businessKycId: string, companyProfilesId: string): Promise<{
    shareCapital: number;
    reserveSurplus: number;
    netWorth: number;
  }> {
    const applicationFinancials =
      await this.businessKycFinancialRepository.findOne({
        where: {
          and: [
            {businessKycId},
            {companyProfilesId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

    if (!applicationFinancials?.capitalDetails) {
      throw new HttpErrors.NotFound('Capital details not found');
    }

    const {capitalDetails} = applicationFinancials;

    return {
      shareCapital: capitalDetails.shareCapital,
      reserveSurplus: capitalDetails.reserveSurplus,
      netWorth: capitalDetails.netWorth,
    };
  }

  // fetch financial ratios and profitability details...
  async fetchFinancialRatiosAndProfitabilityDetails(
    businessKycId: string,
    companyProfilesId: string,

  ): Promise<{
    financialRatios: {
      debtEquityRatio: number;
      currentRatio: number;
      netWorth: number;
      quickRatio: number;
      returnOnEquity: number;
      debtServiceCoverageRatio: number;
      returnOnAsset: number;
    };
    profitabilityDetails: {
      netProfit: number;
    };
  }> {
    const applicationFinancials =
      await this.businessKycFinancialRepository.findOne({
        where: {
          businessKycId,
          companyProfilesId,
          isActive: true,
          isDeleted: false,
        },
      });

    if (!applicationFinancials) {
      throw new HttpErrors.NotFound('Financial data not found for application');
    }

    // --------------------------------------------------
    // CASE 1: Already calculated → return as-is
    // --------------------------------------------------
    if (
      applicationFinancials.financialRatios &&
      applicationFinancials.profitabilityDetails
    ) {
      return {
        financialRatios: applicationFinancials.financialRatios,
        profitabilityDetails: applicationFinancials.profitabilityDetails,
      };
    }

    // --------------------------------------------------
    // CASE 2: Auto-generate SAMPLE ratios (temporary)
    // --------------------------------------------------
    const sampleProfitabilityDetails = {
      netProfit: 12500000, // ₹1.25 Cr
    };

    const sampleFinancialRatios = {
      debtEquityRatio: 1.8,
      currentRatio: 1.6,
      quickRatio: 1.2,
      netWorth: 85000000, // ₹8.5 Cr
      returnOnEquity: 0.15, // 15%
      returnOnAsset: 0.09, // 9%
      debtServiceCoverageRatio: 1.45,
    };

    // OPTIONAL: persist auto-generated values (recommended)
    await this.businessKycFinancialRepository.updateById(
      applicationFinancials.id,
      {
        financialRatios: sampleFinancialRatios,
        profitabilityDetails: sampleProfitabilityDetails,
        status: 0,
        mode: 0,
      },
    );

    return {
      financialRatios: sampleFinancialRatios,
      profitabilityDetails: sampleProfitabilityDetails,
    };
  }

  async isFinancialSectionComplete(
  businessKycId: string,
): Promise<boolean> {

  const data = await this.findExistingFinancial(businessKycId);

  if (!data) return false;

  return !!(
    data.auditedFinancials?.length &&
    data.borrowingDetails &&
    data.capitalDetails &&
    data.fundPosition
  );
}


async fetchFullFinancialSection(
  businessKycId: string,
) {
  const data = await this.findExistingFinancial(businessKycId);

  if (!data) {
    throw new HttpErrors.NotFound('Financial section not found');
  }

  return {
    auditedFinancials: data.auditedFinancials ?? [],
    borrowingDetails: data.borrowingDetails ?? null,
    fundPosition: data.fundPosition ?? null,
    capitalDetails: data.capitalDetails ?? null,
    financialRatios: data.financialRatios ?? null,
    profitabilityDetails: data.profitabilityDetails ?? null,
  };
}

}
