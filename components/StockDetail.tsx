"use client";
import { useState } from "react";
import { BookmarkPlus, BookmarkCheck, TrendingUp, Activity, DollarSign, BarChart2, AlertCircle, Shield, Calculator } from "lucide-react";
import type { QuantAnalysis } from "@/lib/types";
import { PriceChart, PredictionChart } from "./Charts";
import AIAnalysis from "./AIAnalysis";
import { useApp } from "@/lib/context";
import { marketCapFormatted } from "@/lib/quantCalculator";

interface Props {
  analysis: QuantAnalysis;
}

const SCORE_GRADIENT: Record<string, string> = {
  "Strong Buy": "from-emerald-500 to-green-400",
  Buy: "from-green-500 to-teal-400",
  Neutral: "from-yellow-500 to-amber-400",
  Sell: "from-orange-500 to-amber-500",
  "Strong Sell": "from-red-500 to-rose-500",
};

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-base font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3">
      <Icon size={16} className="text-blue-400" />
      <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">{label}</h3>
    </div>
  );
}

function fmt(v: number | undefined, decimals = 2, suffix = "") {
  if (v === undefined || v === null || isNaN(v)) return "N/A";
  return `${v.toFixed(decimals)}${suffix}`;
}

function pct(v: number | undefined, decimals = 1) {
  if (v === undefined || v === null || isNaN(v)) return "N/A";
  return `${(v * 100).toFixed(decimals)}%`;
}

export default function StockDetail({ analysis }: Props) {
  const { addToWatchlist, removeFromWatchlist, watchlist } = useApp();
  const [activePanel, setActivePanel] = useState<"detail" | "ai">("detail");
  const inWatchlist = watchlist.some((w) => w.ticker === analysis.ticker);
  const gradient = SCORE_GRADIENT[analysis.quantScoreLabel] ?? "from-gray-500 to-gray-400";
  const { famaFrench: ff, momentum: mom, volatility: vol, valueMetrics: val, profile } = analysis;

  function toggleWatchlist() {
    if (inWatchlist) {
      removeFromWatchlist(analysis.ticker);
    } else {
      addToWatchlist(analysis.ticker, analysis.quantScore, profile?.price);
    }
  }

  const change = profile?.changes ?? 0;
  const changePositive = change >= 0;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between pt-6 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{analysis.ticker}</h1>
            {profile?.exchange && (
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{profile.exchange}</span>
            )}
          </div>
          {profile?.companyName && (
            <p className="text-gray-400 mt-0.5">{profile.companyName}</p>
          )}
          {profile?.sector && (
            <p className="text-xs text-gray-500 mt-0.5">{profile.sector} · {profile.industry}</p>
          )}
        </div>
        <div className="text-right">
          {profile?.price !== undefined && (
            <p className="text-2xl font-bold text-white">${profile.price.toFixed(2)}</p>
          )}
          {profile?.changes !== undefined && (
            <p className={`text-sm font-medium ${changePositive ? "text-emerald-400" : "text-red-400"}`}>
              {changePositive ? "+" : ""}{change.toFixed(2)} ({changePositive ? "+" : ""}{((change / (profile.price! - change)) * 100).toFixed(2)}%)
            </p>
          )}
        </div>
      </div>

      {/* Quant Score */}
      <div className={`bg-gradient-to-r ${gradient} rounded-2xl p-5 flex items-center justify-between mb-5`}>
        <div>
          <p className="text-white/70 text-sm">Quant Score</p>
          <p className="text-4xl font-black text-white">{analysis.quantScore.toFixed(0)}</p>
          <p className="text-white/90 font-semibold mt-0.5">{analysis.quantScoreLabel}</p>
        </div>
        <div className="text-right">
          {profile && (
            <p className="text-white/80 text-sm">{marketCapFormatted(profile.mktCap)}</p>
          )}
          {analysis.claudeAnalysis && (
            <div className="text-white/80 text-sm mt-1">
              AI Score: {analysis.claudeAnalysis.aiAdjustedScore.toFixed(0)}
            </div>
          )}
          <button
            onClick={toggleWatchlist}
            className="mt-3 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg px-3 py-1.5 transition-colors"
          >
            {inWatchlist ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
            {inWatchlist ? "Watchlisted" : "Add to Watchlist"}
          </button>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Price History (1 Year)</p>
        <PriceChart data={analysis.priceHistory} />
      </div>

      {/* Prediction Chart */}
      {analysis.pricePrediction && (
        <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-blue-400" />
            <p className="text-xs text-gray-400 uppercase tracking-wide">30-Day Prediction</p>
            {analysis.claudeAnalysis && (
              <span className="ml-auto text-xs bg-purple-900/50 text-purple-300 border border-purple-700/50 rounded-md px-2 py-0.5">
                {analysis.claudeAnalysis.selectedFormula} · {analysis.claudeAnalysis.riskMetric}
              </span>
            )}
          </div>
          <PredictionChart prediction={analysis.pricePrediction} />
        </div>
      )}

      {/* Claude error banner */}
      {analysis.claudeError && (
        <div className="flex items-start gap-3 bg-orange-900/30 border border-orange-700/50 rounded-xl p-3 mb-4">
          <AlertCircle size={15} className="text-orange-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-orange-300 font-medium">AI Analysis Failed</p>
            <p className="text-xs text-orange-400/80 mt-0.5">{analysis.claudeError}</p>
          </div>
        </div>
      )}

      {/* Panel tabs if AI available */}
      {analysis.claudeAnalysis && (
        <div className="flex gap-2 mb-5">
          {(["detail", "ai"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActivePanel(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activePanel === tab
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {tab === "detail" ? "Quant Details" : "AI Analysis"}
            </button>
          ))}
        </div>
      )}

      {/* AI Panel */}
      {activePanel === "ai" && analysis.claudeAnalysis && (
        <AIAnalysis analysis={analysis.claudeAnalysis} />
      )}

      {/* Quant Details Panel */}
      {activePanel === "detail" && (
        <>
          {/* Fama-French */}
          {ff && (
            <>
              <SectionHeader icon={BarChart2} label="Fama-French Five-Factor Betas" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard label="Market β" value={fmt(ff.betas.marketBeta, 3)} sub={ff.betas.marketBeta > 1.2 ? "High Sensitivity" : ff.betas.marketBeta > 0.8 ? "Market-Like" : ff.betas.marketBeta > 0.4 ? "Defensive" : "Low Sensitivity"} />
                <MetricCard label="Size SMB β" value={fmt(ff.betas.smbBeta, 3)} sub={ff.betas.smbBeta > 0 ? "Small-cap tilt" : "Large-cap tilt"} />
                <MetricCard label="Value HML β" value={fmt(ff.betas.hmlBeta, 3)} sub={ff.betas.hmlBeta > 0 ? "Value tilt" : "Growth tilt"} />
                <MetricCard label="Profitability RMW β" value={fmt(ff.rmwBeta, 3)} />
                <MetricCard label="Investment CMA β" value={fmt(ff.cmaBeta, 3)} />
                <MetricCard label="Alpha (ann.)" value={`${(ff.betas.alpha * 100).toFixed(2)}%`} />
                <MetricCard label="R²" value={fmt(ff.betas.rSquared, 3)} />
                <MetricCard label="FF5 Expected Return" value={`${((ff.expectedExcessReturn + ff.riskFreeRate) * 100).toFixed(2)}%`} sub="Annual, incl. Rf" />
              </div>
            </>
          )}

          {/* Momentum */}
          {mom && (
            <>
              <SectionHeader icon={TrendingUp} label="Momentum" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="12M Momentum" value={`${((mom.momentum12M - 1) * 100).toFixed(1)}%`} sub={mom.signal} />
                <MetricCard label="6M Momentum" value={`${((mom.momentum6M - 1) * 100).toFixed(1)}%`} />
                <MetricCard label="3M Momentum" value={`${((mom.momentum3M - 1) * 100).toFixed(1)}%`} />
                <MetricCard label="1M Momentum" value={`${((mom.momentum1M - 1) * 100).toFixed(1)}%`} />
              </div>
            </>
          )}

          {/* Volatility */}
          {vol && (
            <>
              <SectionHeader icon={Activity} label="Risk & Volatility" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard label="Annualized Vol" value={pct(vol.annualizedVolatility)} sub={vol.riskLevel} />
                <MetricCard label="30-Day Vol" value={pct(vol.volatility30D)} />
                <MetricCard label="90-Day Vol" value={pct(vol.volatility90D)} />
                <MetricCard label="Sharpe Ratio" value={fmt(vol.sharpeRatio)} />
              </div>
            </>
          )}

          {/* VaR / CVaR / GARCH */}
          {analysis.riskMetrics && (() => {
            const rm = analysis.riskMetrics!;
            return (
              <>
                <SectionHeader icon={Shield} label="Value-at-Risk & Expected Shortfall" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MetricCard label="VaR 95% (1-day)" value={pct(rm.var95)} sub="Historical" />
                  <MetricCard label="VaR 99% (1-day)" value={pct(rm.var99)} sub="Historical" />
                  <MetricCard label="CVaR 95%" value={pct(rm.cvar95)} sub="Exp. Shortfall" />
                  <MetricCard label="CVaR 99%" value={pct(rm.cvar99)} sub="Exp. Shortfall" />
                  <MetricCard label="GARCH Vol (ann.)" value={pct(rm.garchVol)} sub="GARCH(1,1)" />
                </div>
              </>
            );
          })()}

          {/* Kelly Criterion */}
          {analysis.kelly && (() => {
            const k = analysis.kelly!;
            const halfPct = (k.halfKelly * 100).toFixed(1);
            const fullPct = (k.fullKelly * 100).toFixed(1);
            return (
              <>
                <SectionHeader icon={Calculator} label="Kelly Criterion (Position Sizing)" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label="Half Kelly" value={`${halfPct}%`} sub="Recommended sizing" />
                  <MetricCard label="Full Kelly" value={`${fullPct}%`} sub="Raw (use with caution)" />
                  <MetricCard label="Expected Return" value={pct(k.expectedReturn)} sub="Annual (incl. Rf)" />
                  <MetricCard label="Variance" value={fmt(k.variance, 4)} sub="Annualised σ²" />
                </div>
              </>
            );
          })()}

          {/* Value Metrics */}
          {val && (
            <>
              <SectionHeader icon={DollarSign} label="Value & Fundamentals" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {val.bookToMarket !== undefined && (
                  <MetricCard label="Book-to-Market" value={fmt(val.bookToMarket, 3)} sub={val.valueSignal} />
                )}
                {val.peRatio !== undefined && (
                  <MetricCard label="P/E Ratio" value={fmt(val.peRatio, 1)} />
                )}
                {val.pbRatio !== undefined && (
                  <MetricCard label="P/B Ratio" value={fmt(val.pbRatio, 2)} />
                )}
                {val.roe !== undefined && (
                  <MetricCard label="ROE" value={pct(val.roe)} />
                )}
                {val.debtToEquity !== undefined && (
                  <MetricCard label="Debt / Equity" value={fmt(val.debtToEquity, 2)} />
                )}
                {val.earningsYield !== undefined && (
                  <MetricCard label="Earnings Yield" value={pct(val.earningsYield)} />
                )}
                {val.dividendYield !== undefined && (
                  <MetricCard label="Dividend Yield" value={pct(val.dividendYield)} />
                )}
              </div>
            </>
          )}
        </>
      )}

      <p className="text-xs text-gray-600 mt-8 text-center">
        Analyzed {new Date(analysis.analyzedAt).toLocaleString()} · Not financial advice
      </p>
    </div>
  );
}
