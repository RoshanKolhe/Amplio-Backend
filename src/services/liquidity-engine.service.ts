
const BASE_RISK_SCORE = 5;
const BASE_CHARGEBACK_RISK = 1;

const DELAY_RISK: Record<string, number> = {
  'T+0': 1,
  'T+1': 2,
  'T+2': 3,
  'T+4': 4,
  'T+3': 5,
  'T+5': 7,
  'T+6': 8,
  'T+7': 9,
  'T+8': 10,
};

export type LiquidityEngineResult = {
  riskScore: number;
  delayRisk: number;
  chargebackRisk: number;
  haircut: number;
  netAmount: number;
};

type HaircutInput = {
  totalRecieved: number;
  settlementMethod?: string | null;
};

export class LiquidityEngineService {
  calculateHaircut(
    transaction: HaircutInput,
    // Merchant-specific pricing will plug in here later.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    merchant?: unknown,
  ) {
    return 10;
  }

  calculateLiquidity(
    totalRecieved: number,
    settlementMethod?: string | null,
  ): LiquidityEngineResult {
    // const riskScore = BASE_RISK_SCORE;
    // const delayRisk = settlementMethod
    //   ? DELAY_RISK[settlementMethod] ?? 0
    //   : 0;
    // const chargebackRisk = BASE_CHARGEBACK_RISK;
    // const haircut = riskScore + delayRisk + chargebackRisk;

    const riskScore = 0;
    const delayRisk = 0;
    const chargebackRisk = 0;
    const haircut = this.calculateHaircut({
      totalRecieved,
      settlementMethod,
    });
    const haircutAmount = (totalRecieved * haircut) / 100;
    const netAmount = Number((totalRecieved - haircutAmount).toFixed(2));

    return {
      riskScore,
      delayRisk,
      chargebackRisk,
      haircut,
      netAmount,
    };
  }
}
