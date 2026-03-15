import type {
  DailyReturn,
  FactorBetas,
  FamaFrenchResult,
  FMPBalanceSheet,
  FMPIncomeStatement,
  KellyResult,
  MomentumResult,
  MomentumSignal,
  PricePrediction,
  PredictionPoint,
  PricePoint,
  QuantPathPoint,
  QuantPricePath,
  RiskLevel,
  RiskMetrics,
  ValueMetrics,
  VolatilityResult,
  FormulaSet,
  CorrelationInfo,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const ANNUAL_RISK_FREE_RATE = 0.052;
export const DAILY_RISK_FREE_RATE = ANNUAL_RISK_FREE_RATE / 252;
export const MARKET_PREMIUM = 0.055;
export const SMB_PREMIUM = 0.025;
export const HML_PREMIUM = 0.035;
export const RMW_PREMIUM = 0.03;
export const CMA_PREMIUM = 0.02;

// ─── OLS Regression ───────────────────────────────────────────────────────────

interface OLSResult {
  coefficients: number[];
  rSquared: number;
  residuals: number[];
}

function matMulTransposeA(
  A: number[],
  rowsA: number,
  colsA: number,
  B: number[],
  colsB: number
): number[] {
  const result = new Array(colsA * colsB).fill(0);
  for (let i = 0; i < colsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < rowsA; k++) {
        sum += A[k * colsA + i] * B[k * colsB + j];
      }
      result[i * colsB + j] = sum;
    }
  }
  return result;
}

/** Gauss-Jordan matrix inversion */
function invertMatrix(matrix: number[], size: number): number[] | null {
  const n = size;
  const aug = new Array(n * 2 * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * 2 * n + j] = matrix[i * n + j];
    }
    aug[i * 2 * n + n + i] = 1;
  }
  for (let col = 0; col < n; col++) {
    let pivotRow = -1;
    let maxVal = 0;
    for (let row = col; row < n; row++) {
      if (Math.abs(aug[row * 2 * n + col]) > maxVal) {
        maxVal = Math.abs(aug[row * 2 * n + col]);
        pivotRow = row;
      }
    }
    if (pivotRow === -1 || maxVal < 1e-12) return null;
    if (pivotRow !== col) {
      for (let j = 0; j < 2 * n; j++) {
        const tmp = aug[col * 2 * n + j];
        aug[col * 2 * n + j] = aug[pivotRow * 2 * n + j];
        aug[pivotRow * 2 * n + j] = tmp;
      }
    }
    const pivotVal = aug[col * 2 * n + col];
    for (let j = 0; j < 2 * n; j++) aug[col * 2 * n + j] /= pivotVal;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row * 2 * n + col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row * 2 * n + j] -= factor * aug[col * 2 * n + j];
      }
    }
  }
  const inv = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i * n + j] = aug[i * 2 * n + n + j];
    }
  }
  return inv;
}

function olsFit(y: number[], features: number[][]): OLSResult | null {
  const n = y.length;
  const k = features.length;
  if (n <= k + 1) return null;
  const cols = k + 1;

  // Design matrix with intercept
  const X = new Array(n * cols).fill(0);
  for (let row = 0; row < n; row++) {
    X[row * cols] = 1;
    for (let col = 0; col < k; col++) {
      X[row * cols + col + 1] = features[col][row];
    }
  }

  const XtX = matMulTransposeA(X, n, cols, X, cols);
  const XtXInv = invertMatrix(XtX, cols);
  if (!XtXInv) return null;

  const Xty = new Array(cols).fill(0);
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < n; row++) {
      Xty[col] += X[row * cols + col] * y[row];
    }
  }

  const beta = new Array(cols).fill(0);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) {
      beta[i] += XtXInv[i * cols + j] * Xty[j];
    }
  }

  const residuals = new Array(n).fill(0);
  for (let row = 0; row < n; row++) {
    let yHat = 0;
    for (let col = 0; col < cols; col++) yHat += X[row * cols + col] * beta[col];
    residuals[row] = y[row] - yHat;
  }

  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const ssTot = y.reduce((acc, v) => acc + Math.pow(v - yMean, 2), 0);
  const ssRes = residuals.reduce((acc, v) => acc + v * v, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { coefficients: beta, rSquared, residuals };
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function normalizeDate(d: string): string {
  return d.slice(0, 10);
}

export function alignReturns(
  a: DailyReturn[],
  b: DailyReturn[]
): { stock: number[]; market: number[] } {
  const bMap: Record<string, number> = {};
  for (const r of b) bMap[normalizeDate(r.date)] = r.returnValue;
  const stock: number[] = [];
  const market: number[] = [];
  for (const r of a) {
    const key = normalizeDate(r.date);
    if (key in bMap) {
      stock.push(r.returnValue);
      market.push(bMap[key]);
    }
  }
  return { stock, market };
}

// ─── Beta Estimation from Fundamentals ───────────────────────────────────────

function estimateSMBBeta(marketBeta: number): number {
  const base = (marketBeta - 1.0) * 0.5;
  return Math.min(Math.max(base, -1.5), 1.5);
}

function estimateHMLBeta(valueMetrics?: ValueMetrics): number {
  const bm = valueMetrics?.bookToMarket;
  if (bm === undefined) return 0;
  if (bm > 0.8) return 0.8;
  if (bm > 0.5) return 0.4;
  if (bm > 0.2) return 0.0;
  if (bm > 0.1) return -0.4;
  return -0.8;
}

function estimateRMWBeta(valueMetrics?: ValueMetrics): number {
  const roe = valueMetrics?.roe;
  if (roe === undefined) return 0;
  if (roe > 0.2) return 0.6;
  if (roe > 0.1) return 0.3;
  if (roe > 0.0) return 0.0;
  return -0.3;
}

function estimateCMABeta(balanceSheets: FMPBalanceSheet[]): number {
  if (balanceSheets.length < 2) return 0;
  const recent = balanceSheets[0]?.totalAssets;
  const prior = balanceSheets[1]?.totalAssets;
  if (!recent || !prior || prior === 0) return 0;
  const growth = (recent - prior) / prior;
  if (growth < 0.05) return 0.5;
  if (growth < 0.1) return 0.2;
  if (growth < 0.2) return 0.0;
  if (growth < 0.3) return -0.2;
  return -0.5;
}

// ─── Formula Implementation ───────────────────────────────────────────────────

export function computeFormulaResult(
  type: FormulaSet,
  stockReturns: DailyReturn[],
  marketReturns: DailyReturn[],
  smbReturns: DailyReturn[] | null,
  hmlReturns: DailyReturn[] | null,
  valueMetrics: ValueMetrics | undefined,
  incomeStatements: FMPIncomeStatement[],
  balanceSheets: FMPBalanceSheet[],
  riskMetrics: RiskMetrics | null,
  volatility: VolatilityResult | null,
  ticker: string,
  ffFactorEmphasis?: { market: number; smb: number; hml: number; rmw: number; cma: number },
  macroReturns?: { oil: DailyReturn[] | null; rates: DailyReturn[] | null; vix: DailyReturn[] | null; gold: DailyReturn[] | null }
): FamaFrenchResult | null {
  const ff5 = computeFamaFrenchFiveFactor(
    stockReturns,
    marketReturns,
    smbReturns,
    hmlReturns,
    valueMetrics,
    incomeStatements,
    balanceSheets,
    ticker
  );
  if (!ff5) return null;

  // Clamp each emphasis value to [0,1]; fall back to 1 (no scaling) when absent.
  const em = (e: number | undefined) => Math.min(Math.max(e ?? 1, 0), 1);
  const fe = ffFactorEmphasis;

  let expectedReturn = ff5.expectedExcessReturn;

  switch (type) {
    case "CAPM":
      expectedReturn = fe
        ? ff5.betas.alpha + ff5.betas.marketBeta * MARKET_PREMIUM * em(fe.market)
        : ff5.betas.marketBeta * MARKET_PREMIUM;
      break;
    case "FF3":
      expectedReturn = fe
        ? ff5.betas.alpha +
          ff5.betas.marketBeta * MARKET_PREMIUM * em(fe.market) +
          ff5.betas.smbBeta   * SMB_PREMIUM     * em(fe.smb) +
          ff5.betas.hmlBeta   * HML_PREMIUM     * em(fe.hml)
        : ff5.betas.marketBeta * MARKET_PREMIUM +
          ff5.betas.smbBeta   * SMB_PREMIUM +
          ff5.betas.hmlBeta   * HML_PREMIUM;
      break;
    case "FF5":
      if (fe) {
        expectedReturn =
          ff5.betas.alpha +
          ff5.betas.marketBeta * MARKET_PREMIUM * em(fe.market) +
          ff5.betas.smbBeta   * SMB_PREMIUM     * em(fe.smb) +
          ff5.betas.hmlBeta   * HML_PREMIUM     * em(fe.hml) +
          ff5.rmwBeta         * RMW_PREMIUM     * em(fe.rmw) +
          ff5.cmaBeta         * CMA_PREMIUM     * em(fe.cma);
      }
      // else: ff5.expectedExcessReturn already has the correct value
      break;
    case "APT": {
      // Arbitrage Pricing Theory (Ross 1976): E[R] = β_mkt·MktPrem + Σ(β_macro_i · λ_i)
      // Annualised factor risk premiums: oil +4%, rates −2%, vol (VXX) −15%, gold +1%
      const APT_PREMIUMS: Record<string, number> = {
        oil: 0.04, rates: -0.02, vix: -0.15, gold: 0.01,
      };
      const macroAssets = [
        { key: "oil",   returns: macroReturns?.oil },
        { key: "rates", returns: macroReturns?.rates },
        { key: "vix",   returns: macroReturns?.vix },
        { key: "gold",  returns: macroReturns?.gold },
      ];
      let macroContrib = 0;
      for (const asset of macroAssets) {
        if (!asset.returns || asset.returns.length < 60) continue;
        const { stock: sR, market: aR } = alignReturns(stockReturns, asset.returns);
        if (sR.length < 30) continue;
        const reg = olsFit(sR, [aR]);
        if (reg && reg.coefficients.length > 1) {
          macroContrib += reg.coefficients[1] * APT_PREMIUMS[asset.key];
        }
      }
      expectedReturn = ff5.betas.marketBeta * MARKET_PREMIUM + macroContrib;
      break;
    }
    case "SVJ": {
      // Stochastic Volatility + Jump
      // Estimate jump intensity from fat tails
      const returns = stockReturns.map(r => r.returnValue);
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);
      const jumps = returns.filter(r => Math.abs(r - mean) > 3 * std);
      const jumpIntensity = jumps.length / returns.length;
      const jumpDrift = jumpIntensity * (jumps.reduce((a, b) => a + b, 0) / (jumps.length || 1)) * 252;
      expectedReturn = ff5.expectedExcessReturn + jumpDrift;
      break;
    }
    case "Factor-Kelly": {
      // Use half-Kelly fraction to scale the excess return (position sizing inspiration,
      // not raw drift amplification). Clamp to [0, 2] to avoid extreme values.
      if (volatility) {
        const annualVar = volatility.annualizedVolatility ** 2;
        const kellyFraction = annualVar > 0 ? (ff5.expectedExcessReturn + ANNUAL_RISK_FREE_RATE) / annualVar : 0;
        const halfKelly = Math.min(Math.max(kellyFraction * 0.5, 0), 2.0);
        expectedReturn = ff5.expectedExcessReturn * halfKelly;
      }
      break;
    }
    case "GARCH-BS": {
      // GARCH-BS: Use FF5 base return but adjust for vol regime.
      // If GARCH vol > historical vol, penalise drift (uncertainty tax).
      if (riskMetrics) {
        const garchVar = riskMetrics.garchVol ** 2;
        const histVar = (volatility?.annualizedVolatility ?? riskMetrics.garchVol) ** 2;
        const volDiff = garchVar - histVar;
        expectedReturn = ff5.expectedExcessReturn - Math.max(volDiff, 0) * 0.5;
      }
      break;
    }
    case "Tail-CVaR": {
      // Penalise drift for high tail risk
      if (riskMetrics) {
        expectedReturn = ff5.expectedExcessReturn - (riskMetrics.cvar95 * 0.1 * 252);
      }
      break;
    }
  }

  return {
    ...ff5,
    expectedExcessReturn: expectedReturn,
  };
}

// ─── Fama-French ──────────────────────────────────────────────────────────────

export function computeFamaFrench(
  stockReturns: DailyReturn[],
  marketReturns: DailyReturn[],
  smbReturns: DailyReturn[] | null,
  hmlReturns: DailyReturn[] | null,
  valueMetrics?: ValueMetrics
): FamaFrenchResult | null {
  const { stock: stockR, market: mktR } = alignReturns(stockReturns, marketReturns);
  if (stockR.length < 60) return null;

  const rf = DAILY_RISK_FREE_RATE;
  const excessStock = stockR.map((r) => r - rf);
  const excessMarket = mktR.map((r) => r - rf);

  const features: number[][] = [excessMarket];
  let hasSMB = false;
  let hasHML = false;

  if (smbReturns) {
    const { market: smbAligned } = alignReturns(stockReturns, smbReturns);
    if (smbAligned.length === stockR.length) {
      features.push(smbAligned);
      hasSMB = true;
    }
  }
  if (hmlReturns) {
    const { market: hmlAligned } = alignReturns(stockReturns, hmlReturns);
    if (hmlAligned.length === stockR.length) {
      features.push(hmlAligned);
      hasHML = true;
    }
  }

  const reg = olsFit(excessStock, features);
  if (!reg) return null;

  const alpha = reg.coefficients[0];
  const marketBeta = reg.coefficients.length > 1 ? reg.coefficients[1] : 1.0;
  let smbBeta = hasSMB && reg.coefficients.length > 2 ? reg.coefficients[2] : 0;
  let hmlBeta =
    hasSMB && hasHML && reg.coefficients.length > 3
      ? reg.coefficients[3]
      : !hasSMB && hasHML && reg.coefficients.length > 2
        ? reg.coefficients[2]
        : 0;

  if (!hasSMB) smbBeta = estimateSMBBeta(marketBeta);
  if (!hasHML) hmlBeta = estimateHMLBeta(valueMetrics);

  const annualAlpha = alpha * 252;
  const expectedExcess =
    annualAlpha +
    marketBeta * MARKET_PREMIUM +
    smbBeta * SMB_PREMIUM +
    hmlBeta * HML_PREMIUM;

  const betas: FactorBetas = {
    marketBeta,
    smbBeta,
    hmlBeta,
    alpha: annualAlpha,
    rSquared: reg.rSquared,
  };

  return {
    ticker: "",
    betas,
    rmwBeta: 0,
    cmaBeta: 0,
    expectedExcessReturn: expectedExcess,
    riskFreeRate: ANNUAL_RISK_FREE_RATE,
  };
}

export function computeFamaFrenchFiveFactor(
  stockReturns: DailyReturn[],
  marketReturns: DailyReturn[],
  smbReturns: DailyReturn[] | null,
  hmlReturns: DailyReturn[] | null,
  valueMetrics: ValueMetrics | undefined,
  incomeStatements: FMPIncomeStatement[],
  balanceSheets: FMPBalanceSheet[],
  ticker: string
): FamaFrenchResult | null {
  const three = computeFamaFrench(
    stockReturns,
    marketReturns,
    smbReturns,
    hmlReturns,
    valueMetrics
  );
  if (!three) return null;

  const rmwBeta = estimateRMWBeta(valueMetrics);
  const cmaBeta = estimateCMABeta(balanceSheets);
  const fiveFactor =
    three.expectedExcessReturn + rmwBeta * RMW_PREMIUM + cmaBeta * CMA_PREMIUM;

  return {
    ticker,
    betas: three.betas,
    rmwBeta,
    cmaBeta,
    expectedExcessReturn: fiveFactor,
    riskFreeRate: ANNUAL_RISK_FREE_RATE,
  };
}

// ─── Momentum ─────────────────────────────────────────────────────────────────

export function computeMomentum(priceHistory: PricePoint[]): MomentumResult | null {
  if (priceHistory.length < 20) return null;
  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const latestPrice = latest.price;
  const latestTime = new Date(latest.date).getTime();

  function priceNDaysAgo(days: number): number {
    const target = latestTime - days * 86400 * 1000;
    let best = sorted[0];
    for (const p of sorted) {
      if (Math.abs(new Date(p.date).getTime() - target) <
        Math.abs(new Date(best.date).getTime() - target)) {
        best = p;
      }
    }
    return best.price;
  }

  const p252 = priceNDaysAgo(252) || sorted[0].price;
  const p126 = priceNDaysAgo(126) || sorted[0].price;
  const p63 = priceNDaysAgo(63) || sorted[0].price;
  const p21 = priceNDaysAgo(21) || sorted[0].price;

  const m12 = p252 > 0 ? latestPrice / p252 : 1;
  let signal: MomentumSignal;
  if (m12 > 1.2) signal = "Strong";
  else if (m12 > 1.05) signal = "Moderate";
  else if (m12 > 0.95) signal = "Neutral";
  else if (m12 > 0.8) signal = "Weak";
  else signal = "Very Weak";

  return {
    momentum12M: m12,
    momentum6M: p126 > 0 ? latestPrice / p126 : 1,
    momentum3M: p63 > 0 ? latestPrice / p63 : 1,
    momentum1M: p21 > 0 ? latestPrice / p21 : 1,
    signal,
  };
}

// ─── Volatility ───────────────────────────────────────────────────────────────

export function computeVolatility(priceHistory: PricePoint[]): VolatilityResult | null {
  if (priceHistory.length < 30) return null;
  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const logReturns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].price;
    const curr = sorted[i].price;
    if (prev > 0 && curr > 0) logReturns.push(Math.log(curr / prev));
  }

  function stdDev(vals: number[]): number {
    if (vals.length < 2) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (vals.length - 1);
    return Math.sqrt(variance);
  }

  const fullVol = stdDev(logReturns) * Math.sqrt(252);
  const vol30 = stdDev(logReturns.slice(-30)) * Math.sqrt(252);
  const vol90 = stdDev(logReturns.slice(-90)) * Math.sqrt(252);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days =
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000;
  const annualReturn =
    days > 0 && first.price > 0 ? (last.price / first.price - 1) * (365 / days) : 0;
  const sharpe = fullVol > 0 ? (annualReturn - ANNUAL_RISK_FREE_RATE) / fullVol : 0;

  let riskLevel: RiskLevel;
  if (fullVol < 0.15) riskLevel = "Low";
  else if (fullVol < 0.25) riskLevel = "Medium";
  else if (fullVol < 0.4) riskLevel = "High";
  else riskLevel = "Very High";

  return { annualizedVolatility: fullVol, volatility30D: vol30, volatility90D: vol90, sharpeRatio: sharpe, riskLevel };
}

// ─── Quant Score ──────────────────────────────────────────────────────────────

export interface ScoreWeights {
  momentum: number;
  value: number;
  quality: number;
  size: number;
  volatility: number;
}

/** Default fixed weights (sum = 1.0) */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  momentum: 0.30,
  value: 0.25,
  quality: 0.20,
  size: 0.15,
  volatility: 0.10,
};

export function computeQuantScore(
  params: {
    momentum?: MomentumResult | null;
    valueMetrics?: ValueMetrics | null;
    famaFrench?: FamaFrenchResult | null;
    volatility?: VolatilityResult | null;
  },
  weights?: Partial<ScoreWeights>
): number {
  const raw = {
    momentum: weights?.momentum ?? DEFAULT_WEIGHTS.momentum,
    value: weights?.value ?? DEFAULT_WEIGHTS.value,
    quality: weights?.quality ?? DEFAULT_WEIGHTS.quality,
    size: weights?.size ?? DEFAULT_WEIGHTS.size,
    volatility: weights?.volatility ?? DEFAULT_WEIGHTS.volatility,
  };

  // Re-normalize weights based on available data
  const available = {
    momentum: !!params.momentum,
    value: !!params.valueMetrics?.bookToMarket,
    quality: !!params.valueMetrics?.roe,
    size: !!params.famaFrench,
    volatility: !!params.volatility
  };

  let activeTotal = 0;
  if (available.momentum) activeTotal += raw.momentum;
  if (available.value) activeTotal += raw.value;
  if (available.quality) activeTotal += raw.quality;
  if (available.size) activeTotal += raw.size;
  if (available.volatility) activeTotal += raw.volatility;

  if (activeTotal === 0) return 50; // Fallback if no data

  const w = {
    momentum: available.momentum ? raw.momentum / activeTotal : 0,
    value: available.value ? raw.value / activeTotal : 0,
    quality: available.quality ? raw.quality / activeTotal : 0,
    size: available.size ? raw.size / activeTotal : 0,
    volatility: available.volatility ? raw.volatility / activeTotal : 0,
  };

  let score = 0;

  if (available.momentum && params.momentum) {
    const momScore = Math.min(Math.max(((params.momentum.momentum12M - 0.7) / 0.8) * 100, 0), 100);
    score += momScore * w.momentum;
  }
  if (available.value && params.valueMetrics?.bookToMarket !== undefined) {
    const valScore = Math.min(Math.max((params.valueMetrics.bookToMarket / 1.5) * 100, 0), 100);
    score += valScore * w.value;
  }
  if (available.quality && params.valueMetrics?.roe !== undefined) {
    const qualScore = Math.min(
      Math.max(((params.valueMetrics.roe + 0.05) / 0.4) * 100, 0),
      100
    );
    score += qualScore * w.quality;
  }
  if (available.size && params.famaFrench) {
    const sizeScore = params.famaFrench.betas.smbBeta > 0 ? 65 : 40;
    score += sizeScore * w.size;
  }
  if (available.volatility && params.volatility) {
    const volScore = Math.min(
      Math.max(((0.6 - params.volatility.annualizedVolatility) / 0.6) * 100, 0),
      100
    );
    score += volScore * w.volatility;
  }

  return Math.min(Math.max(score, 0), 100);
}

export function quantScoreLabel(score: number): string {
  if (score >= 80) return "Strong Buy";
  if (score >= 65) return "Buy";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Sell";
  return "Strong Sell";
}

export function marketCapFormatted(mktCap?: number): string {
  if (!mktCap) return "N/A";
  if (mktCap >= 1e12) return `$${(mktCap / 1e12).toFixed(2)}T`;
  if (mktCap >= 1e9) return `$${(mktCap / 1e9).toFixed(2)}B`;
  if (mktCap >= 1e6) return `$${(mktCap / 1e6).toFixed(2)}M`;
  return `$${mktCap.toFixed(0)}`;
}

export function computeReturnsFromPrices(prices: PricePoint[]): DailyReturn[] {
  const returns: DailyReturn[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].price;
    const curr = prices[i].price;
    if (prev > 0) {
      const val = (curr - prev) / prev;
      // Cap individual daily returns to +/- 100% to avoid outliers breaking OLS
      returns.push({ date: prices[i].date, returnValue: Math.min(Math.max(val, -1), 1) });
    }
  }
  return returns;
}

// ─── Risk Metrics (VaR / CVaR / GARCH) ───────────────────────────────────────

/**
 * Compute Historical VaR, CVaR and GARCH(1,1) annualised volatility.
 * Uses daily log-returns derived from the price history.
 */
export function computeRiskMetrics(priceHistory: PricePoint[]): RiskMetrics | null {
  if (priceHistory.length < 60) return null;

  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Daily log-returns
  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].price;
    const curr = sorted[i].price;
    if (prev > 0 && curr > 0) returns.push(Math.log(curr / prev));
  }
  if (returns.length < 60) return null;

  // ── Historical VaR & CVaR ────────────────────────────────────────────────
  const asc = [...returns].sort((a, b) => a - b);
  const n = asc.length;

  // 5th-percentile index for 95% VaR
  const cut95 = Math.max(Math.floor(n * 0.05), 1);
  const cut99 = Math.max(Math.floor(n * 0.01), 1);

  // VaR = loss at that quantile (positive number)
  const var95 = -asc[cut95 - 1];
  const var99 = -asc[cut99 - 1];

  // CVaR = average of the tail below the VaR quantile
  const tail95 = asc.slice(0, cut95);
  const tail99 = asc.slice(0, cut99);
  const cvar95 = -(tail95.reduce((s, v) => s + v, 0) / tail95.length);
  const cvar99 = -(tail99.reduce((s, v) => s + v, 0) / tail99.length);

  // ── GARCH(1,1) — standard equity parameters ──────────────────────────────
  // omega=1e-6, alpha=0.09, beta=0.90 are typical starting values for equities.
  // We run the recursion over the full return series to get the terminal h_T,
  // then annualise it.
  const omega = 1e-6;
  const alpha = 0.09;
  const beta = 0.90;

  const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
  const sampleVar = returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length;

  let h = sampleVar;
  for (const r of returns) {
    h = omega + alpha * r * r + beta * h;
  }

  const garchVol = Math.sqrt(h * 252); // annualised

  return { var95, var99, cvar95, cvar99, garchVol };
}

// ─── Kelly Criterion ──────────────────────────────────────────────────────────

/**
 * Classical continuous Kelly fraction:  f* = (μ - rf) / σ²
 * Returns both full Kelly and the conservative half-Kelly.
 */
export function computeKelly(expectedReturn: number, variance: number): KellyResult {
  const excessReturn = expectedReturn - ANNUAL_RISK_FREE_RATE;
  const fullKelly = variance > 0 ? excessReturn / variance : 0;
  return {
    fullKelly,
    halfKelly: fullKelly / 2,
    expectedReturn,
    variance,
  };
}

// ─── Price Prediction (GBM / Log-Normal, BS framework) ───────────────────────

/**
 * Forward price prediction using Geometric Brownian Motion.
 *
 * Drift:     annual expected return from FF5 (or historical Sharpe-adjusted)
 * Volatility: GARCH(1,1) annualised vol (more regime-responsive) or full-history vol
 *
 * Formula (Black–Scholes GBM):
 *   S(t) = S₀ · exp( (μ - σ²/2)·t  ±  z · σ · √t )
 *   - Expected / median path: z = 0
 *   - 95% CI upper:  z = +1.645
 *   - 95% CI lower:  z = -1.645
 *   - Bull scenario: z = +0.5
 *   - Bear scenario: z = -0.5
 *
 * Returns last 30 historical candles + 30 forward forecast points.
 */
export function computePricePrediction(
  priceHistory: PricePoint[],
  famaFrench: FamaFrenchResult | null,
  volatility: VolatilityResult | null,
  riskMetrics: RiskMetrics | null,
  forecastDays = 30,
  selectedFormula?: string
): PricePrediction | null {
  if (!volatility || priceHistory.length < 5) return null;

  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const currentPrice = sorted[sorted.length - 1].price;
  const lastDate = new Date(sorted[sorted.length - 1].date);

  // Annual drift — prefer FF5 expected return; fall back to Sharpe-implied
  const annualDrift = famaFrench
    ? famaFrench.expectedExcessReturn + ANNUAL_RISK_FREE_RATE
    : volatility.sharpeRatio * volatility.annualizedVolatility + ANNUAL_RISK_FREE_RATE;

  // Daily parameters (GARCH vol is more responsive to recent regime)
  const annualVol = riskMetrics?.garchVol ?? volatility.annualizedVolatility;
  const dailyDrift = annualDrift / 252;
  const dailyVol = annualVol / Math.sqrt(252);

  // ── Historical tail (last 30 trading days) ──────────────────────────────
  const histPoints: PredictionPoint[] = sorted.slice(-30).map((p) => ({
    date: p.date,
    actual: parseFloat(p.price.toFixed(2)),
  }));

  // ── Forward forecast (30 trading-day steps) ──────────────────────────────
  const forecastPoints: PredictionPoint[] = [];
  for (let t = 1; t <= forecastDays; t++) {
    // Advance by calendar days (~1.4× to approximate trading days)
    const fd = new Date(lastDate);
    fd.setDate(fd.getDate() + Math.round(t * 1.4));
    const dateStr = fd.toISOString().slice(0, 10);

    // GBM log-drift and diffusion terms
    const logDrift = (dailyDrift - 0.5 * dailyVol * dailyVol) * t;
    const diffusion = dailyVol * Math.sqrt(t);

    const snap = (v: number) => parseFloat(v.toFixed(2));

    forecastPoints.push({
      date: dateStr,
      expected: snap(currentPrice * Math.exp(logDrift)),
      upper95: snap(currentPrice * Math.exp(logDrift + 1.645 * diffusion)),
      lower95: snap(currentPrice * Math.exp(logDrift - 1.645 * diffusion)),
      bull: snap(currentPrice * Math.exp(logDrift + 0.5 * diffusion)),
      bear: snap(currentPrice * Math.exp(logDrift - 0.5 * diffusion)),
    });
  }

  // 30-day terminal summary stats
  const logDrift30 = (dailyDrift - 0.5 * dailyVol * dailyVol) * forecastDays;
  const diffusion30 = dailyVol * Math.sqrt(forecastDays);

  return {
    points: [...histPoints, ...forecastPoints],
    currentPrice,
    expectedReturn30d: Math.exp(logDrift30) - 1,
    upperBound30d: Math.exp(logDrift30 + 1.645 * diffusion30) - 1,
    lowerBound30d: Math.exp(logDrift30 - 1.645 * diffusion30) - 1,
    dailyVol,
    annualDrift,
    formulaUsed: riskMetrics
      ? `GBM · ${selectedFormula ?? "FF5"} drift · GARCH(1,1) vol`
      : `GBM · ${selectedFormula ?? "FF5"} drift · Historical vol`,
  };
}

// ─── Quant Price Path (single composite line, pure calculation) ───────────────

/**
 * Generates a single deterministic price path driven by a comprehensive blend
 * of quantitative signals, macro indicators, and risk-regime adjustments.
 *
 * Composite daily drift is a weighted blend:
 *
 *   Signal 1 — FF5 Factor Return (30%):
 *     Derived from Fama-French 5-factor OLS regression.
 *
 *   Signal 2 — Momentum Persistence (25%):
 *     Based on 3-month and 12-month momentum persistence.
 *
 *   Signal 3 — Macro Interdependency (20%):
 *     Calculates correlation between stock and macro assets (Oil, Rates, VIX, Gold).
 *     Drift = sum(Correlation * MacroTrend).
 *
 *   Signal 4 — Risk-Regime Adjustment (15%):
 *     Adjusts drift based on GARCH(1,1) vs Historical volatility divergence.
 *
 *   Signal 5 — Quant Score Alpha (10%):
 *     Composite fundamental/quality alpha signal.
 */
export function computeQuantPricePath(
  priceHistory: PricePoint[],
  famaFrench: FamaFrenchResult | null,
  momentum: MomentumResult | null,
  quantScore: number,
  riskMetrics: RiskMetrics | null,
  macroData?: {
    oil: DailyReturn[] | null;
    rates: DailyReturn[] | null;
    vix: DailyReturn[] | null;
    gold: DailyReturn[] | null;
  },
  correlatedStocks?: { ticker: string; returns: DailyReturn[]; correlation: number }[],
  forecastDays = 30
): QuantPricePath | null {
  if (priceHistory.length < 10) return null;

  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const stockReturns = computeReturnsFromPrices(sorted);
  const currentPrice = sorted[sorted.length - 1].price;
  const lastDate = new Date(sorted[sorted.length - 1].date);

  // ── Signal 1: Formula Drift (30% weight) ───────────────────────────────────
  // Uses the AI-selected formula expected return
  const formulaAnnual = famaFrench
    ? famaFrench.expectedExcessReturn + ANNUAL_RISK_FREE_RATE
    : ANNUAL_RISK_FREE_RATE + MARKET_PREMIUM * 0.8;
  const formulaDaily = formulaAnnual / 252;

  // ── Signal 2: Momentum (25% weight) ─────────────────────────────────────
  const rawMom3M = momentum?.momentum3M ?? 1.0;
  const rawMom12M = momentum?.momentum12M ?? 1.0;
  // Blend 3M and 12M momentum
  const momAnnual = Math.min(
    Math.max(0.6 * (Math.pow(rawMom3M, 4) - 1) + 0.4 * (rawMom12M - 1), -0.50),
    0.80
  );
  const momDaily = momAnnual / 252;

  // ── Signal 3: Macro & Correlations (20% weight) ─────────────────────────
  let macroAnnual = 0;
  const correlations: CorrelationInfo[] = [];

  if (macroData) {
    const assets = [
      { name: "Oil", returns: macroData.oil },
      { name: "Rates", returns: macroData.rates },
      { name: "VIX", returns: macroData.vix },
      { name: "Gold", returns: macroData.gold },
    ];

    for (const asset of assets) {
      if (!asset.returns || asset.returns.length < 60) continue;
      const { stock, market: assetR } = alignReturns(stockReturns, asset.returns);
      if (stock.length < 30) continue;

      // Calculate correlation
      const meanS = stock.reduce((a, b) => a + b, 0) / stock.length;
      const meanA = assetR.reduce((a, b) => a + b, 0) / assetR.length;
      let num = 0, denS = 0, denA = 0;
      for (let i = 0; i < stock.length; i++) {
        const ds = stock[i] - meanS;
        const da = assetR[i] - meanA;
        num += ds * da;
        denS += ds * ds;
        denA += da * da;
      }
      const corr = denS > 0 && denA > 0 ? num / Math.sqrt(denS * denA) : 0;

      // Recent trend (last 21 days)
      const trend = asset.returns.slice(-21).reduce((a, b) => a + b.returnValue, 0) * (252 / 21);
      macroAnnual += corr * trend * 0.25; // Scaled impact
    }
  }

  // Add 10 correlated stocks
  if (correlatedStocks && correlatedStocks.length > 0) {
    for (const stock of correlatedStocks) {
      const trend = stock.returns.slice(-21).reduce((a, b) => a + b.returnValue, 0) * (252 / 21);
      const contribution = stock.correlation * trend * 0.1; // 10% weight spread across peers
      macroAnnual += contribution;

      correlations.push({
        ticker: stock.ticker,
        correlation: stock.correlation,
        impact: contribution > 0 ? "Positive" : contribution < 0 ? "Negative" : "Neutral",
        explanation: `Pearson r = ${stock.correlation.toFixed(2)}. Recent trend in ${stock.ticker} contributes ${contribution > 0 ? "upside" : "downside"} to the composite drift.`,
      });
    }
  }

  macroAnnual = Math.min(Math.max(macroAnnual, -0.30), 0.30);
  const macroDaily = macroAnnual / 252;

  // ── Signal 4: Risk/GARCH (15% weight) ───────────────────────────────────
  // If GARCH vol > Historical vol, we penalise drift (uncertainty tax)
  const histVol = computeVolatility(priceHistory)?.annualizedVolatility ?? 0.25;
  const garchVol = riskMetrics?.garchVol ?? histVol;
  const volDiff = garchVol - histVol;
  const riskAdjAnnual = -Math.max(volDiff, 0) * 0.5; // High vol regime = lower drift
  const riskDaily = riskAdjAnnual / 252;

  // ── Signal 5: Score Alpha (10% weight) ──────────────────────────────────
  const scoreNorm = (quantScore - 50) / 50;
  const scoreAlphaAnnual = scoreNorm * MARKET_PREMIUM * 0.50;
  const scoreDaily = scoreAlphaAnnual / 252;

  // ── Composite weighted daily return ─────────────────────────────────────
  const W = { FORMULA: 0.30, MOM: 0.25, MACRO: 0.20, RISK: 0.15, SCR: 0.10 };
  let compositeDaily =
    W.FORMULA * formulaDaily +
    W.MOM * momDaily +
    W.MACRO * macroDaily +
    W.RISK * riskDaily +
    W.SCR * scoreDaily;

  // Cap daily drift to +/- 2% (approx 500% annualized) to prevent UI-breaking exponential growth
  compositeDaily = Math.min(Math.max(compositeDaily, -0.02), 0.02);
  const compositeAnnual = compositeDaily * 252;

  // ── Forecast ───────────────────────────────────────────────────────────
  const histPoints: QuantPathPoint[] = sorted.slice(-30).map((p) => ({
    date: p.date,
    actual: parseFloat(p.price.toFixed(2)),
  }));

  const forecastPoints: QuantPathPoint[] = [];
  for (let t = 1; t <= forecastDays; t++) {
    const fd = new Date(lastDate);
    fd.setDate(fd.getDate() + Math.round(t * 1.4));
    forecastPoints.push({
      date: fd.toISOString().slice(0, 10),
      quant: parseFloat(
        (currentPrice * Math.pow(1 + compositeDaily, t)).toFixed(2)
      ),
    });
  }

  const expected30d = Math.pow(1 + compositeDaily, forecastDays) - 1;

  return {
    points: [...histPoints, ...forecastPoints],
    currentPrice,
    expectedReturn30d: expected30d,
    annualDrift: compositeAnnual,
    methodology: "Multi-Factor Quant Blend (Selected Formula, Momentum, Peer Correlation, Risk, Score)",
    signals: {
      ff5Weight: W.FORMULA,
      momentumWeight: W.MOM,
      scoreWeight: W.SCR,
      macroWeight: W.MACRO,
      riskWeight: W.RISK,
      ff5AnnualReturn: formulaAnnual,
      momentum3MAnnualised: momAnnual,
      scoreAlphaAnnual,
      macroAnnualReturn: macroAnnual,
      riskAdjustedAnnualReturn: riskAdjAnnual,
      compositeDailyReturn: compositeDaily,
    },
    correlations,
  };
}

