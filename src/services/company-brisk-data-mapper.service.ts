import {indianOilJson} from '../utils/indianOil';
import {HttpErrors} from '@loopback/rest';

export class CompanyDataMapperService {
  constructor() { }

  private normalizeText(value: string | null | undefined) {
    return (value ?? '').toString().trim().toUpperCase();
  }

  private validatePanAndName(
    panNumber: string,
    entityName: string,
    entityLabel: 'company' | 'merchant' | 'investor' | 'trustee',
  ) {
    const companyKyc =
      indianOilJson?.CorporateDirectory?.CompanyKYC;

    const originalPan = companyKyc?.CompanyPAN;
    const originalCompanyName = companyKyc?.CompanyName;

    const submittedPan = this.normalizeText(panNumber);
    const actualPan = this.normalizeText(originalPan);
    const submittedEntityName = this.normalizeText(entityName);
    const actualCompanyName = this.normalizeText(originalCompanyName);

    if (!actualPan) {
      throw new HttpErrors.NotFound('Original company PAN not found in source data');
    }

    if (submittedPan !== actualPan) {
      throw new HttpErrors.BadRequest(
        `Submitted PAN does not match ${entityLabel} PAN`,
      );
    }

    if (!submittedEntityName || submittedEntityName !== actualCompanyName) {
      throw new HttpErrors.BadRequest(
        `Submitted ${entityLabel} name does not match ${entityLabel} name`,
      );
    }

    return {
      success: true,
      isPanMatched: true,
      isCompanyNameMatched: true,
      submitted: {
        panNumber: submittedPan,
        companyName: submittedEntityName,
      },
      source: {
        panNumber: actualPan,
        companyName: actualCompanyName,
      },
    };
  }

  // company kyc data...
  async fetchCompanyDataFromInstaFinancials(cin: string) {
    const companyMaster =
      indianOilJson?.CorporateDirectory?.CompanyMaster;
    const companyKyc =
      indianOilJson?.CorporateDirectory?.CompanyKYC;
    const companyGstin =
      companyKyc?.CompanyGST;

    if (!companyMaster) {
      return null;
    }

    return {
      cin,
      companyName: companyKyc?.CompanyName ?? null,
      companyCin: companyKyc?.CompanyCIN ?? cin,
      companyStatus: companyKyc?.CompanyStatus ?? null,
      companyPan: companyKyc?.CompanyPAN ?? null,
      companyTan: companyKyc?.CompanyTAN ?? null,
      epfNumbers: Array.isArray(companyKyc?.CompanyEPF)
        ? companyKyc.CompanyEPF
        : [],
      dateOfIncorporation: companyMaster?.DateOfIncorporation ?? null,
      category: companyMaster?.Category ?? null,
      subCategory: companyMaster?.SubCategory ?? null,
      class: companyMaster?.Class ?? null,
      listingStatus: companyMaster?.ListingStatus ?? null,
      authorizedCapital: companyMaster?.AuthorizedCapital ?? 0,
      paidupCapital: companyMaster?.PaidupCapital ?? 0,
      address: companyMaster?.Address ?? null,
      lastAgmDate: companyMaster?.LastAGMDate ?? null,
      balancesheetDate: companyMaster?.BalancesheetDate ?? null,
      email: companyMaster?.Email ?? null,
      website: companyMaster?.Website ?? null,
      currentDirectorsCount: companyMaster?.CurrentDirectorsCount ?? 0,
      pastDirectorsCount: companyMaster?.PastDirectorsCount ?? 0,
      signatoriesCount: companyMaster?.SignatoriesCount ?? 0,
      activeCompliance: companyMaster?.ActiveCompliance ?? null,
      statusUnderCirp: companyMaster?.StatusUnderCIRP ?? null,
      suspendedAtStockExchange: companyMaster?.SuspendedAtStockExchange ?? null,
      filingStatusForLastTwoYears:
        companyMaster?.FilingStatusForLastTwoYears ?? null,
      gstins: Array.isArray(companyGstin) ? companyGstin : [],
    };
  }

  // company pan validation...
  async companyPanValidation(panNumber: string, companyName: string) {
    return {
      ...this.validatePanAndName(panNumber, companyName, 'company'),
      message: 'Company PAN and name matched',
    };
  }

  async merchantPanValidation(panNumber: string, merchantName: string) {
    return {
      ...this.validatePanAndName(panNumber, merchantName, 'merchant'),
      message: 'Merchant PAN and name matched',
    };
  }

  async investorPanValidation(panNumber: string, investorName: string) {
    return {
      ...this.validatePanAndName(panNumber, investorName, 'investor'),
      message: 'Investor PAN and name matched',
    };
  }

  async trusteePanValidation(panNumber: string, trusteeName: string) {
    return {
      ...this.validatePanAndName(panNumber, trusteeName, 'trustee'),
      message: 'Trustee PAN and name matched',
    };
  }

  // company financial data..
  async fetchOutstandingBorrowingsData(cin: string) {
    const borrowings =
      indianOilJson?.SchedulesAndDisclosuresFinancialsInfo?.Borrowings;

    if (!borrowings) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getLatestYearAmount = (arr: any[]) => {
      if (!arr?.length) return 0;

      // sort by financial year ascending
      const sorted = [...arr].sort((a, b) =>
        a.FinancialYear.localeCompare(b.FinancialYear)
      );

      return sorted[sorted.length - 1]?.Amount || 0;
    };

    const totalSecured = getLatestYearAmount(
      borrowings?.SecuredBorrowings?.TotalSecuredBorrowings
    );

    const totalUnsecured = getLatestYearAmount(
      borrowings?.UnsecuredBorrowings?.TotalUnsecuredBorrowings
    );

    const totalBorrowings = getLatestYearAmount(
      borrowings?.TotalBorrowings
    );

    return {
      cin,
      securedBorrowings: totalSecured,
      unsecuredBorrowings: totalUnsecured,
      totalBorrowings: totalBorrowings,
      securedPercentage:
        totalBorrowings > 0
          ? ((totalSecured / totalBorrowings) * 100).toFixed(2)
          : 0,
      unsecuredPercentage:
        totalBorrowings > 0
          ? ((totalUnsecured / totalBorrowings) * 100).toFixed(2)
          : 0,
    };
  }

  async fetchCompanyFinancials(cin: string) {
    const financials =
      indianOilJson?.ComparativeFinancialsStandalone;

    if (!financials) return null;

    type FinancialValue = {
      FinancialYear: string;
      Amount: number;
    };

    const getLatest = (
      arr?: FinancialValue[]
    ): {year: string; amount: number} => {
      if (!arr?.length) {
        return {year: "", amount: 0};
      }

      const sorted = [...arr].sort((a, b) =>
        a.FinancialYear.localeCompare(b.FinancialYear)
      );

      const latest = sorted[sorted.length - 1];

      return {
        year: latest.FinancialYear,
        amount: latest.Amount ?? 0,
      };
    };

    // -------- PROFIT & LOSS --------
    const revenue = getLatest(
      financials?.ProfitAndLossStatement?.OperatingRevenues
    );

    const ebitda = getLatest(
      financials?.ProfitAndLossStatement?.EBDITA
    );

    const interestExpense = getLatest(
      financials?.ProfitAndLossStatement?.Interests
    );

    const pat = getLatest(
      financials?.ProfitAndLossStatement?.PAT
    );

    // -------- BALANCE SHEET --------
    const netWorth = getLatest(
      financials?.BalanceSheetStandalone?.NetWorth
    );

    const totalBorrowings = getLatest(
      financials?.BalanceSheetStandalone?.Borrowings
    );

    const currentAssets = getLatest(
      financials?.BalanceSheetStandalone?.CurrentAssets
    );

    const currentLiabilities = getLatest(
      financials?.BalanceSheetStandalone?.CurrentLiabilities
    );

    const workingCapital = getLatest(
      financials?.BalanceSheetStandalone?.WorkingCapitals
    );

    const cashAndBank = getLatest(
      financials?.BalanceSheetStandalone?.CashAndBankBalances
    );

    // -------- CASH FLOW --------
    const operatingCashFlow = getLatest(
      financials?.CashFlowStatementStandalone?.OperatingActivities
    );

    // -------- RATIOS --------
    const interestCoverage = getLatest(
      financials?.RatioAnalysisStandalone?.InterestCoverages
    );

    const currentRatio = getLatest(
      financials?.RatioAnalysisStandalone?.CurrentRatio
    );

    const debtToEquity = getLatest(
      financials?.RatioAnalysisStandalone?.NetDebtEquities
    );

    const ebitdaMargin = getLatest(
      financials?.RatioAnalysisStandalone?.EBITDAMarginPercentages
    );

    const patMargin = getLatest(
      financials?.RatioAnalysisStandalone?.PATMarginPercentage
    );

    const roce = getLatest(
      financials?.RatioAnalysisStandalone?.ReturnOnCapitalEmployedPercentage_RoCEs
    );

    const roe = getLatest(
      financials?.RatioAnalysisStandalone?.ReturnOnEquityPercentage_RoEs
    );

    const revenueGrowth = getLatest(
      financials?.RatioAnalysisStandalone?.OperativeRevenueGrowthPercentages
    );

    const ebitdaGrowth = getLatest(
      financials?.RatioAnalysisStandalone?.EBITDAGrowths
    );

    // -------- Derived Credit Metrics --------
    const debtToRevenue =
      revenue.amount > 0
        ? Number((totalBorrowings.amount / revenue.amount).toFixed(2))
        : 0;

    const debtToEbitda =
      ebitda.amount > 0
        ? Number((totalBorrowings.amount / ebitda.amount).toFixed(2))
        : 0;

    const netDebt =
      totalBorrowings.amount - cashAndBank.amount;

    return {
      cin,
      financialYear: revenue.year,

      // Income strength
      revenue: revenue.amount,
      ebitda: ebitda.amount,
      pat: pat.amount,
      interestExpense: interestExpense.amount,

      // Balance sheet
      netWorth: netWorth.amount,
      totalBorrowings: totalBorrowings.amount,
      netDebt,
      cashAndBank: cashAndBank.amount,

      currentAssets: currentAssets.amount,
      currentLiabilities: currentLiabilities.amount,
      workingCapital: workingCapital.amount,

      // Cash flow
      operatingCashFlow: operatingCashFlow.amount,

      // Ratios
      interestCoverage: interestCoverage.amount,
      currentRatio: currentRatio.amount,
      debtToEquity: debtToEquity.amount,
      ebitdaMargin: ebitdaMargin.amount,
      patMargin: patMargin.amount,
      roce: roce.amount,
      roe: roe.amount,
      revenueGrowth: revenueGrowth.amount,
      ebitdaGrowth: ebitdaGrowth.amount,

      // Derived ratios
      debtToRevenue,
      debtToEbitda,
    };

  }

  async fetchCompanyCreditRating(cin: string) {
    const ratings =
      indianOilJson?.CreditRatings;

    const latestRatings =
      ratings?.CreditRatingsAssignedInLastOneYear;
    const olderRatings =
      ratings?.CreditRatingsOlderThanLastOneYear;

    // Prefer latest ratings, fallback to older ratings
    const selectedRating =
      latestRatings?.[0] ?? olderRatings?.[0] ?? null;

    if (selectedRating) {
      return {
        cin,
        ratingAgency: selectedRating.RatingAgency ?? null,
        dateOfRating: selectedRating.DateOfRating ?? null,
        instrumentDetails: selectedRating.InstrumentDetails ?? null,
        ratingAssigned: selectedRating.RatingAssigned ?? null,
        outlook: selectedRating.Outlook ?? null,
        rationalLink: selectedRating.RationalLink ?? null,
      };
    }

    const companyRatingHighlight = indianOilJson
      ?.CompanyHighlightsForLatestFinancialYear
      ?.NonFinancialHighlights
      ?.find((item: {HighlightName: string; HighlightValue: string}) =>
        item?.HighlightName === 'Company Rating'
      );

    if (!companyRatingHighlight) {
      return null;
    }

    return {
      cin,
      companyRating: companyRatingHighlight?.HighlightValue ?? null,
    };
  }
}
