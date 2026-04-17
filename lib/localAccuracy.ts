/**
 * Accuracy tracking stored only in the browser (localStorage).
 * Each completed analysis can append a prediction; evaluation runs on demand via /api/accuracy/evaluate.
 */

import type { QuantAnalysis } from "./types";

const STORAGE_KEY = "sq_accuracy_records";

export const ACCURACY_UPDATED_EVENT = "sq:accuracy-recorded";

export interface LocalAccuracyEvaluation {
  evaluationDate: string;
  actualPrice: number;
  predictedReturn: number;
  actualReturn: number;
  inCi95: boolean | null;
  directionCorrect: boolean;
  predictionErrorPct: number;
}

export interface LocalAccuracyRecord {
  id: string;
  ticker: string;
  predictionDate: string;
  startPrice: number;
  predictedPrice30d: number;
  predictedReturn30d: number;
  predictedUpper95: number | null;
  predictedLower95: number | null;
  predictedDirection: "UP" | "DOWN";
  quantScore: number;
  formulaUsed: string;
  createdAt: string;
  evaluation: LocalAccuracyEvaluation | null;
}

export interface AccuracySummary {
  totalPredictions: number;
  evaluated: number;
  pending: number;
  directionalAccuracy: number;
  ciCoverageRate: number;
  meanAbsoluteErrorPct: number;
}

export interface FormulaRow {
  formula: string;
  count: number;
  directionalAccuracy: number;
  mape: number;
}

export interface TickerRow {
  ticker: string;
  count: number;
  directionalAccuracy: number;
  mape: number;
  avgQuantScore: number;
}

export interface RecentResultRow {
  ticker: string;
  predictionDate: string;
  evaluationDate: string;
  startPrice: number;
  predictedPrice: number;
  actualPrice: number;
  predictedReturn: number;
  actualReturn: number;
  inCi95: boolean | null;
  directionCorrect: boolean;
  predictionErrorPct: number;
  quantScore: number;
  formulaUsed: string;
}

export interface RecentPredictionRow {
  ticker: string;
  prediction_date: string;
  predicted_return_30d: number;
  predicted_direction: string;
  quant_score: number;
  formula_used: string;
  is_evaluated: boolean;
}

export interface AccuracyDashboardData {
  summary: AccuracySummary;
  byFormula: FormulaRow[];
  byTicker: TickerRow[];
  recentPredictions: RecentPredictionRow[];
  recentResults: RecentResultRow[];
}

export function loadAccuracyRecords(): LocalAccuracyRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as LocalAccuracyRecord[];
  } catch {
    return [];
  }
}

export function saveAccuracyRecords(records: LocalAccuracyRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new Event(ACCURACY_UPDATED_EVENT));
  } catch (e) {
    console.error("[localAccuracy] Failed to save:", e);
  }
}

function stableRecordId(ticker: string, predictionDate: string): string {
  return `${ticker.replace(/\./g, "_")}_${predictionDate}`;
}

/** Call when a full quant analysis completes; skips if there is no price prediction. */
export function appendPredictionFromAnalysis(analysis: QuantAnalysis): void {
  const pred = analysis.pricePrediction;
  if (!pred || typeof window === "undefined") return;

  const predictionDate = analysis.analyzedAt.slice(0, 10);
  const startPrice = pred.currentPrice;
  if (!startPrice || startPrice <= 0) return;

  const predictedPrice30d = startPrice * (1 + pred.expectedReturn30d);
  const predictedUpper95 =
    pred.upperBound30d != null ? startPrice * (1 + pred.upperBound30d) : null;
  const predictedLower95 =
    pred.lowerBound30d != null ? startPrice * (1 + pred.lowerBound30d) : null;
  const predictedDirection: "UP" | "DOWN" = pred.expectedReturn30d >= 0 ? "UP" : "DOWN";
  const formulaUsed =
    analysis.claudeAnalysis?.selectedFormula ?? pred.formulaUsed ?? "FF5";

  const records = loadAccuracyRecords();
  const id = stableRecordId(analysis.ticker, predictionDate);
  const withoutSameDay = records.filter(
    (r) => !(r.ticker === analysis.ticker && r.predictionDate === predictionDate)
  );

  const next: LocalAccuracyRecord = {
    id,
    ticker: analysis.ticker,
    predictionDate,
    startPrice,
    predictedPrice30d,
    predictedReturn30d: pred.expectedReturn30d,
    predictedUpper95,
    predictedLower95,
    predictedDirection,
    quantScore: analysis.quantScore,
    formulaUsed,
    createdAt: new Date().toISOString(),
    evaluation: null,
  };

  saveAccuracyRecords([next, ...withoutSameDay]);
}

export function applyEvaluationUpdates(
  records: LocalAccuracyRecord[],
  updates: { id: string; evaluation: LocalAccuracyEvaluation }[]
): LocalAccuracyRecord[] {
  const map = new Map(updates.map((u) => [u.id, u.evaluation]));
  return records.map((r) => {
    const ev = map.get(r.id);
    if (!ev) return r;
    return { ...r, evaluation: ev };
  });
}

/** Records that are unevaluated and at least `minAgeDays` calendar days after predictionDate. */
export function recordsDueForEvaluation(
  records: LocalAccuracyRecord[],
  minAgeDays = 30
): LocalAccuracyRecord[] {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - minAgeDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return records.filter((r) => !r.evaluation && r.predictionDate <= cutoffStr);
}

export function buildAccuracyDashboardData(records: LocalAccuracyRecord[]): AccuracyDashboardData {
  const evaluated = records.filter((r) => r.evaluation);
  const pending = records.length - evaluated.length;

  let directionalAccuracy = 0;
  let ciCoverageRate = 0;
  let meanAbsoluteErrorPct = 0;

  if (evaluated.length > 0) {
    const correct = evaluated.filter((r) => r.evaluation!.directionCorrect).length;
    directionalAccuracy = correct / evaluated.length;

    const withCi = evaluated.filter((r) => r.evaluation!.inCi95 !== null);
    if (withCi.length > 0) {
      ciCoverageRate = withCi.filter((r) => r.evaluation!.inCi95).length / withCi.length;
    }

    meanAbsoluteErrorPct =
      evaluated.reduce((sum, r) => sum + r.evaluation!.predictionErrorPct, 0) / evaluated.length;
  }

  const formulaMap: Record<string, { correct: number; total: number; errorSum: number }> = {};
  for (const r of evaluated) {
    const ev = r.evaluation!;
    if (!formulaMap[r.formulaUsed]) {
      formulaMap[r.formulaUsed] = { correct: 0, total: 0, errorSum: 0 };
    }
    formulaMap[r.formulaUsed].total++;
    if (ev.directionCorrect) formulaMap[r.formulaUsed].correct++;
    formulaMap[r.formulaUsed].errorSum += ev.predictionErrorPct;
  }

  const byFormula = Object.entries(formulaMap)
    .map(([formula, d]) => ({
      formula,
      count: d.total,
      directionalAccuracy: d.total > 0 ? d.correct / d.total : 0,
      mape: d.total > 0 ? d.errorSum / d.total : 0,
    }))
    .sort((a, b) => b.directionalAccuracy - a.directionalAccuracy);

  const tickerMap: Record<string, { correct: number; total: number; errorSum: number; scoreSum: number }> =
    {};
  for (const r of evaluated) {
    const ev = r.evaluation!;
    if (!tickerMap[r.ticker]) {
      tickerMap[r.ticker] = { correct: 0, total: 0, errorSum: 0, scoreSum: 0 };
    }
    tickerMap[r.ticker].total++;
    if (ev.directionCorrect) tickerMap[r.ticker].correct++;
    tickerMap[r.ticker].errorSum += ev.predictionErrorPct;
    tickerMap[r.ticker].scoreSum += r.quantScore;
  }

  const byTicker = Object.entries(tickerMap)
    .map(([ticker, d]) => ({
      ticker,
      count: d.total,
      directionalAccuracy: d.total > 0 ? d.correct / d.total : 0,
      mape: d.total > 0 ? d.errorSum / d.total : 0,
      avgQuantScore: d.total > 0 ? d.scoreSum / d.total : 0,
    }))
    .sort((a, b) => b.directionalAccuracy - a.directionalAccuracy);

  const sortedByCreated = [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const recentPredictions: RecentPredictionRow[] = sortedByCreated.slice(0, 30).map((r) => ({
    ticker: r.ticker,
    prediction_date: r.predictionDate,
    predicted_return_30d: r.predictedReturn30d,
    predicted_direction: r.predictedDirection,
    quant_score: r.quantScore,
    formula_used: r.formulaUsed,
    is_evaluated: !!r.evaluation,
  }));

  const sortedResults = [...evaluated].sort(
    (a, b) =>
      new Date(b.evaluation!.evaluationDate).getTime() -
      new Date(a.evaluation!.evaluationDate).getTime()
  );

  const recentResults: RecentResultRow[] = sortedResults.slice(0, 20).map((r) => {
    const ev = r.evaluation!;
    return {
      ticker: r.ticker,
      predictionDate: r.predictionDate,
      evaluationDate: ev.evaluationDate,
      startPrice: r.startPrice,
      predictedPrice: r.predictedPrice30d,
      actualPrice: ev.actualPrice,
      predictedReturn: ev.predictedReturn,
      actualReturn: ev.actualReturn,
      inCi95: ev.inCi95,
      directionCorrect: ev.directionCorrect,
      predictionErrorPct: ev.predictionErrorPct,
      quantScore: r.quantScore,
      formulaUsed: r.formulaUsed,
    };
  });

  return {
    summary: {
      totalPredictions: records.length,
      evaluated: evaluated.length,
      pending,
      directionalAccuracy,
      ciCoverageRate,
      meanAbsoluteErrorPct,
    },
    byFormula,
    byTicker,
    recentPredictions,
    recentResults,
  };
}
