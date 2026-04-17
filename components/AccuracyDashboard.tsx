"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  FlaskConical,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  BarChart3,
  Play,
} from "lucide-react";
import { useApp } from "@/lib/context";
import {
  ACCURACY_UPDATED_EVENT,
  applyEvaluationUpdates,
  buildAccuracyDashboardData,
  loadAccuracyRecords,
  recordsDueForEvaluation,
  saveAccuracyRecords,
  type AccuracyDashboardData,
  type LocalAccuracyEvaluation,
} from "@/lib/localAccuracy";

function pct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`;
}

function scoreColor(v: number): string {
  if (v >= 0.6) return "text-emerald-400";
  if (v >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

export default function AccuracyDashboard() {
  const { apiKeys, envKeysSet } = useApp();
  const [data, setData] = useState<AccuracyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluateLoading, setEvaluateLoading] = useState(false);
  const [evaluateError, setEvaluateError] = useState("");

  const hasPolygon = Boolean(envKeysSet || apiKeys.polygon);

  function refreshFromStorage() {
    const records = loadAccuracyRecords();
    setData(buildAccuracyDashboardData(records));
    setLoading(false);
  }

  useEffect(() => {
    refreshFromStorage();
    const onUpdate = () => refreshFromStorage();
    window.addEventListener(ACCURACY_UPDATED_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(ACCURACY_UPDATED_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  async function evaluateDue() {
    const records = loadAccuracyRecords();
    const due = recordsDueForEvaluation(records, 30);
    if (!due.length) {
      window.alert(
        "No unevaluated predictions are due yet. Predictions must be at least 30 calendar days old."
      );
      return;
    }
    if (!hasPolygon) {
      window.alert(
        "A Polygon API key is required. Add it in Settings, or set POLYGON_API_KEY for server-side use."
      );
      return;
    }

    setEvaluateLoading(true);
    setEvaluateError("");
    try {
      const items = due.map((r) => ({
        id: r.id,
        ticker: r.ticker,
        predictionDate: r.predictionDate,
        startPrice: r.startPrice,
        predictedPrice30d: r.predictedPrice30d,
        predictedUpper95: r.predictedUpper95,
        predictedLower95: r.predictedLower95,
        predictedDirection: r.predictedDirection,
      }));

      const res = await fetch("/api/accuracy/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          polygonKey: envKeysSet ? undefined : apiKeys.polygon,
          items,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        results?: { id: string; evaluation: LocalAccuracyEvaluation }[];
        errors?: { id: string; error: string }[];
      };

      if (!res.ok) {
        throw new Error(body.error ?? "Evaluation failed");
      }

      const updates = (body.results ?? []).map((x) => ({
        id: x.id,
        evaluation: x.evaluation,
      }));
      const next = applyEvaluationUpdates(loadAccuracyRecords(), updates);
      saveAccuracyRecords(next);
      setData(buildAccuracyDashboardData(next));

      if (body.errors?.length) {
        console.warn("[AccuracyDashboard] Partial failures:", body.errors);
        const msg = body.errors.map((e) => `${e.id}: ${e.error}`).join("; ");
        setEvaluateError(`Some tickers failed: ${msg.slice(0, 400)}${msg.length > 400 ? "…" : ""}`);
      }
    } catch (e) {
      setEvaluateError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setEvaluateLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-primary" />
        <span className="ml-3 text-slate-400">Loading accuracy data...</span>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-8 pb-10 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <FlaskConical size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Accuracy Testing</h1>
            <p className="text-slate-400 text-sm">
              Predictions from your Analysis runs are stored in this browser
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={evaluateDue}
            disabled={evaluateLoading || !hasPolygon}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 text-primary border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {evaluateLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Evaluate due (30d+)
          </button>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              refreshFromStorage();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-slate-400 hover:text-slate-50 hover:bg-slate-800 transition-colors text-sm"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {!hasPolygon && (
        <div className="flex items-start gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            Add a Polygon key in Settings to evaluate predictions (fetch actual prices).
          </span>
        </div>
      )}

      {evaluateError && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{evaluateError}</span>
        </div>
      )}

      <div className="bg-primary/5 border border-cyan-500/20 rounded-xl p-4 text-sm text-slate-400">
        <span className="text-primary font-medium">How it works: </span>
        Each time you finish a stock analysis on the Analysis tab, a snapshot of the 30-day price
        forecast is saved locally in your browser. When a prediction is at least 30 calendar days
        old, use <strong className="text-slate-300">Evaluate due</strong> to compare the forecast to
        actual market prices (via Polygon). Nothing is sent to a database or cron job.
      </div>

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            label="Total Predictions"
            value={s.totalPredictions.toString()}
            icon={<BarChart3 size={16} />}
            color="text-primary"
          />
          <StatCard
            label="Evaluated"
            value={s.evaluated.toString()}
            icon={<CheckCircle2 size={16} />}
            color="text-emerald-400"
          />
          <StatCard
            label="Pending (30d)"
            value={s.pending.toString()}
            icon={<Clock size={16} />}
            color="text-slate-400"
          />
          <StatCard
            label="Directional Accuracy"
            value={s.evaluated > 0 ? pct(s.directionalAccuracy) : "—"}
            sublabel="target: > 55%"
            icon={<TrendingUp size={16} />}
            color={s.evaluated > 0 ? scoreColor(s.directionalAccuracy) : "text-slate-400"}
          />
          <StatCard
            label="CI Coverage Rate"
            value={s.evaluated > 0 ? pct(s.ciCoverageRate) : "—"}
            sublabel="target: ~95%"
            icon={<CheckCircle2 size={16} />}
            color={
              s.evaluated > 0 ? (s.ciCoverageRate >= 0.9 ? "text-emerald-400" : "text-yellow-400") : "text-slate-400"
            }
          />
          <StatCard
            label="Mean Abs. Error"
            value={s.evaluated > 0 ? `${s.meanAbsoluteErrorPct.toFixed(1)}%` : "—"}
            sublabel="30d price error"
            icon={<AlertCircle size={16} />}
            color={
              s.evaluated > 0
                ? s.meanAbsoluteErrorPct < 5
                  ? "text-emerald-400"
                  : s.meanAbsoluteErrorPct < 10
                    ? "text-yellow-400"
                    : "text-red-400"
                : "text-slate-400"
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {(data?.byFormula?.length ?? 0) > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-50 text-sm">Formula Performance</h2>
              <p className="text-slate-400 text-xs mt-0.5">Directional accuracy by selected formula</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/50">
                    <th className="text-left px-5 py-3 text-slate-400 font-medium text-xs">Formula</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Predictions</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Direction</th>
                    <th className="text-right px-5 py-3 text-slate-400 font-medium text-xs">MAPE</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byFormula ?? []).map((row) => (
                    <tr key={row.formula} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-slate-50 font-mono text-xs">{row.formula}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{row.count}</td>
                      <td className={`px-4 py-3 text-right font-medium ${scoreColor(row.directionalAccuracy)}`}>
                        {pct(row.directionalAccuracy)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">{row.mape.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(data?.byTicker?.length ?? 0) > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-50 text-sm">Per-Ticker Accuracy</h2>
              <p className="text-slate-400 text-xs mt-0.5">Evaluated predictions by symbol</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/50">
                    <th className="text-left px-5 py-3 text-slate-400 font-medium text-xs">Ticker</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Predictions</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Direction</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">MAPE</th>
                    <th className="text-right px-5 py-3 text-slate-400 font-medium text-xs">Avg Score</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byTicker ?? []).map((row) => (
                    <tr key={row.ticker} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-slate-50 font-semibold">{row.ticker}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{row.count}</td>
                      <td className={`px-4 py-3 text-right font-medium ${scoreColor(row.directionalAccuracy)}`}>
                        {pct(row.directionalAccuracy)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">{row.mape.toFixed(1)}%</td>
                      <td className="px-5 py-3 text-right text-slate-400">{row.avgQuantScore.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {(data?.recentResults?.length ?? 0) > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-slate-50 text-sm">Recent Evaluated Predictions</h2>
            <p className="text-slate-400 text-xs mt-0.5">Latest results with actual vs. predicted comparison</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/50">
                  <th className="text-left px-5 py-3 text-slate-400 font-medium text-xs">Ticker</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Predicted</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Evaluated</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Start</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Predicted</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Actual</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Error</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Direction</th>
                  <th className="text-center px-5 py-3 text-slate-400 font-medium text-xs">In CI</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentResults ?? []).map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 text-slate-50 font-semibold">{r.ticker}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.predictionDate}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.evaluationDate}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmtPrice(r.startPrice)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmtPrice(r.predictedPrice)}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        r.actualReturn > 0 ? "text-emerald-400" : r.actualReturn < 0 ? "text-red-400" : "text-slate-400"
                      }`}
                    >
                      {fmtPrice(r.actualPrice)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{r.predictionErrorPct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-center">
                      {r.directionCorrect ? (
                        <CheckCircle2 size={14} className="text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle size={14} className="text-red-400 mx-auto" />
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {r.inCi95 === null ? (
                        <span className="text-slate-400 text-xs">—</span>
                      ) : r.inCi95 ? (
                        <CheckCircle2 size={14} className="text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle size={14} className="text-red-400 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(data?.recentPredictions?.length ?? 0) > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-slate-50 text-sm">Recent Predictions</h2>
            <p className="text-slate-400 text-xs mt-0.5">Saved from your analyses (newest first)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/50">
                  <th className="text-left px-5 py-3 text-slate-400 font-medium text-xs">Ticker</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Date</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">30d Return</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Direction</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Quant Score</th>
                  <th className="text-left px-5 py-3 text-slate-400 font-medium text-xs">Formula</th>
                  <th className="text-center px-5 py-3 text-slate-400 font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentPredictions ?? []).map((p, i) => (
                  <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 text-slate-50 font-semibold">{p.ticker}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{p.prediction_date}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        Number(p.predicted_return_30d) > 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {Number(p.predicted_return_30d) >= 0 ? "+" : ""}
                      {(Number(p.predicted_return_30d) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.predicted_direction === "UP" ? (
                        <TrendingUp size={14} className="text-emerald-400 mx-auto" />
                      ) : (
                        <TrendingDown size={14} className="text-red-400 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{Number(p.quant_score).toFixed(0)}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{p.formula_used}</td>
                    <td className="px-5 py-3 text-center">
                      {p.is_evaluated ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                          Evaluated
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-primary border border-cyan-500/20">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(data?.summary?.totalPredictions ?? 0) === 0 && (
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-slate-400 text-sm">
          No predictions stored yet. Run a full analysis from the <strong className="text-slate-300">Analysis</strong>{" "}
          tab; when it completes, the forecast snapshot is saved here automatically.
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  icon,
  color,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className={`flex items-center gap-1.5 mb-2 ${color}`}>
        {icon}
        <span className="text-xs font-medium text-slate-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sublabel && <p className="text-slate-400 text-xs mt-0.5">{sublabel}</p>}
    </div>
  );
}
