// ─── Polygon.io ───────────────────────────────────────────────────────────────

export interface PolygonBar {
  t: number; // timestamp ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
  n?: number;
}

export interface PolygonAggregateResponse {
  ticker?: string;
  results?: PolygonBar[];
  status?: string;
  resultsCount?: number;
}

// ─── FMP ──────────────────────────────────────────────────────────────────────

export interface FMPProfile {
  symbol: string;
  companyName: string;
  price?: number;
  mktCap?: number;
  sector?: string;
  industry?: string;
  description?: string;
  exchange?: string;
  beta?: number;
  volAvg?: number;
  changes?: number;
  image?: string;
}

export interface FMPKeyMetrics {
  symbol?: string;
  date?: string;
  bookValuePerShare?: number;
  priceToBookRatio?: number;
  peRatio?: number;
  pbRatio?: number;
  revenuePerShare?: number;
  netIncomePerShare?: number;
  operatingCashFlowPerShare?: number;
  roe?: number;
  roa?: number;
  debtToEquity?: number;
  currentRatio?: number;
  earningsYield?: number;
  dividendYield?: number;
  marketCap?: number;
}

export interface FMPRatios {
  symbol?: string;
  date?: string;
  priceToBookRatio?: number;
  priceEarningsRatio?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  netProfitMargin?: number;
  operatingProfitMargin?: number;
  dividendYield?: number;
  debtRatio?: number;
}

export interface FMPIncomeStatement {
  date?: string;
  netIncome?: number;
  revenue?: number;
  operatingIncome?: number;
  grossProfit?: number;
}

export interface FMPBalanceSheet {
  date?: string;
  totalAssets?: number;
  totalStockholdersEquity?: number;
  totalDebt?: number;
  cashAndCashEquivalents?: number;
}

// ─── App Models ───────────────────────────────────────────────────────────────

export interface StockSearchResult {
  ticker: string;
  name: string;
  exchange: string;
}

export interface PricePoint {
  date: string; // ISO string
  price: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
}

export interface DailyReturn {
  date: string;
  returnValue: number;
}

export interface WatchlistItem {
  id: string;
  ticker: string;
  addedDate: string;
  lastQuantScore?: number;
  lastPrice?: number;
}

// ─── Quant Models ─────────────────────────────────────────────────────────────

export interface FactorBetas {
  marketBeta: number;
  smbBeta: number;
  hmlBeta: number;
  alpha: number;
  rSquared: number;
}

export interface FamaFrenchResult {
  ticker: string;
  betas: FactorBetas;
  rmwBeta: number;
  cmaBeta: number;
  expectedExcessReturn: number;
  riskFreeRate: number;
}

export type MomentumSignal = "Strong" | "Moderate" | "Neutral" | "Weak" | "Very Weak";
export type RiskLevel = "Low" | "Medium" | "High" | "Very High";

export interface MomentumResult {
  momentum12M: number;
  momentum6M: number;
  momentum3M: number;
  momentum1M: number;
  signal: MomentumSignal;
}

export interface VolatilityResult {
  annualizedVolatility: number;
  volatility30D: number;
  volatility90D: number;
  sharpeRatio: number;
  riskLevel: RiskLevel;
}

export interface ValueMetrics {
  bookToMarket?: number;
  peRatio?: number;
  pbRatio?: number;
  roe?: number;
  debtToEquity?: number;
  earningsYield?: number;
  dividendYield?: number;
  valueSignal: string;
}

// ─── Extended Risk & Sizing Metrics ──────────────────────────────────────────

/** Historical Value-at-Risk and Expected Shortfall (CVaR) */
export interface RiskMetrics {
  /** 1-day 95% Historical VaR (as positive decimal, e.g. 0.03 = 3%) */
  var95: number;
  /** 1-day 99% Historical VaR */
  var99: number;
  /** 1-day 95% CVaR / Expected Shortfall */
  cvar95: number;
  /** 1-day 99% CVaR */
  cvar99: number;
  /** Annualised volatility from GARCH(1,1) fit */
  garchVol: number;
}

/** Kelly Criterion result */
export interface KellyResult {
  /** Full Kelly fraction (can exceed 1 — raw) */
  fullKelly: number;
  /** Half-Kelly (recommended conservative sizing) */
  halfKelly: number;
  /** Annualised expected return used in the calculation */
  expectedReturn: number;
  /** Variance used in the calculation */
  variance: number;
}

// ─── SSE Progress Events ──────────────────────────────────────────────────────

export type ProgressStage =
  | "fetching"     // Fetching Stock Data...
  | "researching"  // Claude Researching...
  | "selecting"    // Selecting Best Formula...
  | "calculating"  // Calculating...
  | "reporting"    // Generating Report...
  | "complete"     // Final payload event
  | "error";       // Error event

export interface ProgressEvent {
  stage: ProgressStage;
  message: string;
  /** Only present on the "complete" event */
  result?: QuantAnalysis;
  /** Only present on the "error" event */
  error?: string;
}

// ─── Price Prediction ─────────────────────────────────────────────────────────

export interface PredictionPoint {
  date: string;
  /** Actual historical closing price (only set for historical tail) */
  actual?: number;
  /** GBM median / expected price (only set for forecast points) */
  expected?: number;
  /** Upper 95% confidence bound (only set for forecast points) */
  upper95?: number;
  /** Lower 95% confidence bound (only set for forecast points) */
  lower95?: number;
  /** Optimistic scenario: drift + 0.5σ (only set for forecast points) */
  bull?: number;
  /** Pessimistic scenario: drift − 0.5σ (only set for forecast points) */
  bear?: number;
}

export interface PricePrediction {
  /** Combined 30-day historical tail + 30-day forward forecast */
  points: PredictionPoint[];
  currentPrice: number;
  /** Expected 30-day return as decimal (e.g. 0.05 = +5%) */
  expectedReturn30d: number;
  /** 95% CI upper bound at 30 days (decimal) */
  upperBound30d: number;
  /** 95% CI lower bound at 30 days (decimal) */
  lowerBound30d: number;
  dailyVol: number;
  annualDrift: number;
  formulaUsed: string;
}

// ─── Claude / AI ──────────────────────────────────────────────────────────────

/**
 * Formula sets from the quantitative finance research paper.
 * Factor models: CAPM, FF3, FF5, APT
 * Composite / hybrid models from the paper:
 *   SVJ        = Stochastic Volatility + Jump (Heston + Merton)
 *   Factor-Kelly = Multi-Factor Log-Optimal Kelly
 *   GARCH-BS   = Volatility-Adjusted Black-Scholes
 *   Tail-CVaR  = Tail-Risk-Adjusted Factor Model
 */
export type FormulaSet =
  | "CAPM" | "FF3" | "FF5" | "APT"
  | "SVJ" | "Factor-Kelly" | "GARCH-BS" | "Tail-CVaR";
export type RiskMetricChoice = "CVaR" | "VaR" | "Sharpe" | "GARCH";

/**
 * Claude's ONLY job is to research the stock and select the best formula.
 * It does NOT make predictions, issue buy/sell ratings, or calculate numbers.
 */
export interface ClaudeAnalysis {
  /** Primary factor model Claude recommends for this stock */
  selectedFormula: FormulaSet;
  /** Recommended weights for the 5-factor score (normalised to sum=1) */
  scoreWeights: {
    momentum: number;
    value: number;
    quality: number;
    size: number;
    volatility: number;
  };
  /** Relative importance of each FF factor for this stock (0–1) */
  ffFactorEmphasis: {
    market: number;
    smb: number;
    hml: number;
    rmw: number;
    cma: number;
  };
  /** Which risk metric should dominate the risk component */
  riskMetric: RiskMetricChoice;
  /** Human-readable name for the chosen formula, e.g. "Quality-Growth FF5" */
  recommendedFormula: string;
  /** Plain-English rationale: why these weights suit this stock's profile */
  rationale: string;
  /** Score recalculated by the engine using Claude's recommended weights */
  aiAdjustedScore: number;
  /** Claude's narrative research summary of the company's current state */
  researchSummary?: string;
}

// ─── Master Analysis ──────────────────────────────────────────────────────────

export interface QuantAnalysis {
  id: string;
  ticker: string;
  profile?: FMPProfile;
  analyzedAt: string;
  famaFrench?: FamaFrenchResult;
  momentum?: MomentumResult;
  volatility?: VolatilityResult;
  valueMetrics?: ValueMetrics;
  riskMetrics?: RiskMetrics;
  kelly?: KellyResult;
  priceHistory: PricePoint[];
  pricePrediction?: PricePrediction;
  claudeAnalysis?: ClaudeAnalysis;
  claudeError?: string;
  /** Base quant score (fixed 30/25/20/15/10 default weights) */
  quantScore: number;
  quantScoreLabel: string;
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  ticker: string;
  polygonKey: string;
  fmpKey: string;
  claudeKey?: string;
}
