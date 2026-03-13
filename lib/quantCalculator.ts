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
  RiskLevel,
  RiskMetrics,
  ValueMetrics,
  VolatilityResult,
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
    momentum:   weights?.momentum   ?? DEFAULT_WEIGHTS.momentum,
    value:      weights?.value      ?? DEFAULT_WEIGHTS.value,
    quality:    weights?.quality    ?? DEFAULT_WEIGHTS.quality,
    size:       weights?.size       ?? DEFAULT_WEIGHTS.size,
    volatility: weights?.volatility ?? DEFAULT_WEIGHTS.volatility,
  };
  const total = raw.momentum + raw.value + raw.quality + raw.size + raw.volatility || 1;
  const w = {
    momentum:   raw.momentum   / total,
    value:      raw.value      / total,
    quality:    raw.quality    / total,
    size:       raw.size       / total,
    volatility: raw.volatility / total,
  };

  let score = 50;

  if (params.momentum) {
    const momScore = Math.min(Math.max(((params.momentum.momentum12M - 0.7) / 0.8) * 100, 0), 100);
    score += (momScore - 50) * w.momentum;
  }
  if (params.valueMetrics?.bookToMarket !== undefined) {
    const valScore = Math.min(Math.max((params.valueMetrics.bookToMarket / 1.5) * 100, 0), 100);
    score += (valScore - 50) * w.value;
  }
  if (params.valueMetrics?.roe !== undefined) {
    const qualScore = Math.min(
      Math.max(((params.valueMetrics.roe + 0.05) / 0.4) * 100, 0),
      100
    );
    score += (qualScore - 50) * w.quality;
  }
  if (params.famaFrench) {
    const sizeScore = params.famaFrench.betas.smbBeta > 0 ? 65 : 40;
    score += (sizeScore - 50) * w.size;
  }
  if (params.volatility) {
    const volScore = Math.min(
      Math.max(((0.6 - params.volatility.annualizedVolatility) / 0.6) * 100, 0),
      100
    );
    score += (volScore - 50) * w.volatility;
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
    if (prev > 0) returns.push({ date: prices[i].date, returnValue: (curr - prev) / prev });
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
  const beta  = 0.90;

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
  forecastDays = 30
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
      upper95:  snap(currentPrice * Math.exp(logDrift + 1.645 * diffusion)),
      lower95:  snap(currentPrice * Math.exp(logDrift - 1.645 * diffusion)),
      bull:     snap(currentPrice * Math.exp(logDrift + 0.5  * diffusion)),
      bear:     snap(currentPrice * Math.exp(logDrift - 0.5  * diffusion)),
    });
  }

  // 30-day terminal summary stats
  const logDrift30 = (dailyDrift - 0.5 * dailyVol * dailyVol) * forecastDays;
  const diffusion30 = dailyVol * Math.sqrt(forecastDays);

  return {
    points: [...histPoints, ...forecastPoints],
    currentPrice,
    expectedReturn30d: Math.exp(logDrift30) - 1,
    upperBound30d:     Math.exp(logDrift30 + 1.645 * diffusion30) - 1,
    lowerBound30d:     Math.exp(logDrift30 - 1.645 * diffusion30) - 1,
    dailyVol,
    annualDrift,
    formulaUsed: riskMetrics
      ? "GBM · FF5 drift · GARCH(1,1) vol"
      : "GBM · FF5 drift · Historical vol",
  };
}
