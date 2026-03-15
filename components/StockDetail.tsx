"use client";
import { useState } from "react";
import {
  BookmarkPlus, BookmarkCheck, TrendingUp, Activity, DollarSign,
  BarChart2, AlertCircle, Shield, Calculator, Zap, ArrowUpRight, ArrowDownRight, Brain
} from "lucide-react";
import type { QuantAnalysis } from "@/lib/types";
import { PriceChart, PredictionChart, QuantPredictionChart } from "./Charts";
import AIAnalysis from "./AIAnalysis";
import { useApp } from "@/lib/context";
import { marketCapFormatted } from "@/lib/quantCalculator";

interface Props {
  analysis: QuantAnalysis;
}

const SCORE_CONFIG: Record<string, { gradient: string; text: string; icon: any }> = {
  "Strong Buy": { gradient: "from-emerald-500 to-green-400", text: "text-emerald-400", icon: TrendingUp },
  Buy: { gradient: "from-green-500 to-teal-400", text: "text-green-400", icon: ArrowUpRight },
  Neutral: { gradient: "from-yellow-500 to-amber-400", text: "text-yellow-400", icon: Activity },
  Sell: { gradient: "from-orange-500 to-amber-500", text: "text-orange-400", icon: ArrowDownRight },
  "Strong Sell": { gradient: "from-red-500 to-rose-500", text: "text-red-400", icon: AlertCircle },
};

function MetricCard({ label, value, sub, highlight = false, trend }: { label: string; value: string; sub?: string; highlight?: boolean, trend?: "up" | "down" }) {
  return (
    <div className={`group relative p-4 rounded-2xl border transition-all duration-300 hover:translate-y-[-2px] ${highlight
        ? "bg-primary/5 border-primary/20 shadow-lg shadow-primary/5"
        : "bg-surface-highlight/40 border-white/5 hover:bg-surface-highlight/60 hover:border-white/10"
      }`}>
      <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 opacity-60 group-hover:opacity-100 transition-opacity">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={`text-xl font-bold tracking-tight tabular-nums ${highlight ? "text-primary" : "text-text-primary"}`}>
          {value}
        </p>
        {trend && (
          <span className={`text-[10px] font-black ${trend === "up" ? "text-success" : "text-danger"}`}>
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      {sub && <p className="text-[10px] font-medium text-text-secondary/40 mt-1 leading-tight group-hover:text-text-secondary/60 transition-colors">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, label, gradient = false, sub }: { icon: React.ElementType; label: string; gradient?: boolean; sub?: string }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl border ${gradient ? "bg-primary/10 border-primary/20" : "bg-surface-highlight/50 border-white/5"}`}>
          <Icon size={18} className={gradient ? "text-primary" : "text-text-secondary"} />
        </div>
        <div>
          <h3 className={`text-xs font-black uppercase tracking-widest ${gradient ? "bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary" : "text-text-secondary"}`}>
            {label}
          </h3>
          {sub && <p className="text-[9px] text-text-secondary/40 font-bold uppercase tracking-tight mt-0.5">{sub}</p>}
        </div>
      </div>
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
  const [activeTab, setActiveTab] = useState<"quant" | "ai">("quant");
  const [showAiScore, setShowAiScore] = useState(true);

  if (!analysis) return null;

  const inWatchlist = watchlist?.some((w) => w.ticker === analysis.ticker);

  // Choose which score to display primarily
  const hasAiScore = !!analysis.claudeAnalysis?.aiAdjustedScore;
  const currentScore = (hasAiScore && showAiScore) ? analysis.claudeAnalysis!.aiAdjustedScore : analysis.quantScore;
  const currentLabel = (hasAiScore && showAiScore) ? analysis.quantScoreLabel : analysis.quantScoreLabel; // Labels are same for now

  const config = SCORE_CONFIG[analysis.quantScoreLabel] ?? SCORE_CONFIG["Neutral"];
  const { famaFrench: ff, momentum: mom, volatility: vol, valueMetrics: val, profile } = analysis;
  const change = profile?.changes ?? 0;
  const changePositive = change >= 0;

  function toggleWatchlist() {
    if (inWatchlist) {
      removeFromWatchlist(analysis.ticker);
    } else {
      addToWatchlist(analysis.ticker, analysis.quantScore, profile?.price);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-slide-up">
      {/* ─── Top Header Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Ticker Info */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="flex items-center gap-4 mb-3">
            <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter">{analysis.ticker}</h1>
            <div className="flex flex-col gap-1">
              {profile?.exchange && (
                <span className="px-2 py-0.5 rounded bg-surface-highlight border border-white/5 text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                  {profile.exchange}
                </span>
              )}
              {profile?.sector && (
                <span className="text-[10px] text-primary/80 font-bold uppercase tracking-widest">
                  {profile.sector}
                </span>
              )}
            </div>
            <button
              onClick={toggleWatchlist}
              className={`ml-auto p-3 rounded-2xl transition-all ${inWatchlist
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/5"
                  : "bg-surface-highlight/50 text-text-secondary border border-white/5 hover:text-white hover:bg-surface-highlight"
                }`}
            >
              {inWatchlist ? <BookmarkCheck size={22} /> : <BookmarkPlus size={22} />}
            </button>
          </div>

          <h2 className="text-xl md:text-2xl text-text-secondary font-semibold tracking-tight mb-8">
            {profile?.companyName ?? "Unknown Company"}
          </h2>

          <div className="flex items-center gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest opacity-50">Current Price</p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold text-text-primary tracking-tighter tabular-nums">
                  ${profile?.price?.toFixed(2) ?? "0.00"}
                </span>
                <span className={`text-xl font-bold flex items-center gap-1 ${changePositive ? "text-success" : "text-danger"}`}>
                  {changePositive ? <ArrowUpRight size={20} strokeWidth={3} /> : <ArrowDownRight size={20} strokeWidth={3} />}
                  {(() => {
                    const prevPrice = (profile?.price ?? 0) - change;
                    return prevPrice !== 0 ? Math.abs((change / prevPrice) * 100).toFixed(2) : "0.00";
                  })()}%
                </span>
              </div>
            </div>

            <div className="h-12 w-px bg-white/5 mx-2 hidden sm:block" />

            <div className="space-y-1 hidden sm:block">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest opacity-50">Market Cap</p>
              <p className="text-2xl font-bold text-text-primary tracking-tight">
                {marketCapFormatted(profile?.mktCap)}
              </p>
            </div>
          </div>
        </div>

        {/* Quant Score Card - Refined Side-by-Side Comparison */}
        <div className="lg:col-span-5 relative group">
          <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-10 blur-2xl rounded-[2rem] group-hover:opacity-20 transition-opacity duration-500`} />
          <div className="relative h-full bg-surface/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 flex flex-col justify-between overflow-hidden shadow-2xl">
            {/* Background Icon */}
            <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500">
              <config.icon size={200} />
            </div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-primary" fill="currentColor" />
                  <span className="text-xs font-black text-text-secondary uppercase tracking-[0.2em]">Quant Confidence</span>
                </div>

                {hasAiScore && (
                  <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                    <button
                      onClick={() => setShowAiScore(false)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${!showAiScore ? "bg-surface-highlight text-white shadow-lg" : "text-text-secondary hover:text-white"}`}
                    >
                      BASE
                    </button>
                    <button
                      onClick={() => setShowAiScore(true)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${showAiScore ? "bg-secondary/20 text-secondary shadow-lg border border-secondary/20" : "text-text-secondary hover:text-white"}`}
                    >
                      AI
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-end gap-1">
                  <span className={`text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br ${config.gradient}`}>
                    {currentScore.toFixed(0)}
                  </span>
                  <span className="text-xl font-bold text-text-secondary/40 mb-4">/100</span>
                </div>

                {hasAiScore && (
                  <div className="flex flex-col gap-1 border-l border-white/10 pl-6 py-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-bold text-text-secondary/50 uppercase">Base</span>
                      <span className="text-sm font-bold text-text-primary">{analysis.quantScore.toFixed(0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-bold text-secondary/70 uppercase">AI Adj.</span>
                      <span className="text-sm font-bold text-secondary">{analysis.claudeAnalysis!.aiAdjustedScore.toFixed(0)}</span>
                    </div>
                    <div className={`mt-1 text-[10px] font-black uppercase ${analysis.claudeAnalysis!.aiAdjustedScore >= analysis.quantScore ? "text-success" : "text-danger"}`}>
                      {analysis.claudeAnalysis!.aiAdjustedScore >= analysis.quantScore ? "+" : ""}
                      {(analysis.claudeAnalysis!.aiAdjustedScore - analysis.quantScore).toFixed(0)} pts
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="relative z-10 mt-8">
              <div className="w-full bg-black/20 rounded-full h-3 p-0.5 border border-white/5 mb-3">
                <div
                  className={`h-full bg-gradient-to-r ${config.gradient} rounded-full transition-all duration-1000 cubic-bezier(0.4, 0, 0.2, 1) shadow-[0_0_15px_rgba(6,182,212,0.3)]`}
                  style={{ width: `${currentScore}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className={`font-black ${config.text} uppercase tracking-[0.3em] text-sm`}>
                  {analysis.quantScoreLabel}
                </p>
                <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                  <Activity size={12} className="text-text-secondary" />
                  <span className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-tighter">Engine v2.1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Charts Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Main Price Chart */}
        <div className="glass-panel rounded-[2rem] p-8 shadow-2xl">
          <SectionHeader icon={BarChart2} label="Price Action (1Y)" sub="Historical Trend" />
          <div className="w-full mt-4">
            <PriceChart data={analysis.priceHistory} />
          </div>
        </div>

        {/* Prediction / Quant Chart */}
        <div className="flex flex-col gap-8">
          {/* Prioritize Quant Path if available, else GBM */}
          {analysis.quantPricePath ? (
            <div className="glass-panel rounded-[2rem] p-8 flex-1 shadow-2xl">
              <SectionHeader icon={Zap} label="Quant Projection" gradient sub="Composite Factor Analysis" />
              <QuantPredictionChart path={analysis.quantPricePath} />
            </div>
          ) : analysis.pricePrediction ? (
            <div className="glass-panel rounded-[2rem] p-8 flex-1 shadow-2xl">
              <SectionHeader icon={TrendingUp} label="Scenario Forecast" sub="GBM Monte-Carlo" />
              <PredictionChart prediction={analysis.pricePrediction} />
            </div>
          ) : null}
        </div>
      </div>

      {/* ─── Tabs & Details ───────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-white/5 pb-1">
        <button
          onClick={() => setActiveTab("quant")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === "quant" ? "text-primary" : "text-text-secondary hover:text-white"
            }`}
        >
          Quantitative Data
          {activeTab === "quant" && (
            <div className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-primary shadow-[0_0_15px_rgba(6,182,212,0.8)]" />
          )}
        </button>
        {analysis.claudeAnalysis && (
          <button
            onClick={() => setActiveTab("ai")}
            className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all relative flex items-center gap-2 ${activeTab === "ai" ? "text-secondary" : "text-text-secondary hover:text-white"
              }`}
          >
            <Brain size={14} /> AI Research
            {activeTab === "ai" && (
              <div className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-secondary shadow-[0_0_15px_rgba(139,92,246,0.8)]" />
            )}
          </button>
        )}
      </div>

      <div className="mt-8">
        {activeTab === "ai" && analysis.claudeAnalysis && (
          <div className="animate-fade-in">
            <AIAnalysis analysis={analysis.claudeAnalysis} />
          </div>
        )}

        {activeTab === "quant" && (
          <div className="space-y-8 animate-fade-in">
            {/* Fama-French & Value Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Factor Exposure */}
              {ff && (
                <div className="glass-panel rounded-[2rem] p-8 shadow-xl">
                  <SectionHeader icon={BarChart2} label="Factor Exposure" sub="Fama-French 5-Factor Model" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <MetricCard label="Market β" value={fmt(ff.betas.marketBeta, 2)} sub="Systematic Risk" highlight trend={ff.betas.marketBeta > 1.2 ? "up" : ff.betas.marketBeta < 0.8 ? "down" : undefined} />
                    <MetricCard label="Size (SMB)" value={fmt(ff.betas.smbBeta, 2)} sub="Small Cap Tilt" />
                    <MetricCard label="Value (HML)" value={fmt(ff.betas.hmlBeta, 2)} sub="Value Premium" />
                    <MetricCard label="Profit (RMW)" value={fmt(ff.rmwBeta, 2)} sub="Quality Factor" />
                    <MetricCard label="Inv (CMA)" value={fmt(ff.cmaBeta, 2)} sub="Investment Factor" />
                    <MetricCard label="Alpha (α)" value={`${(ff.betas.alpha * 100).toFixed(2)}%`} sub="Excess Return" highlight trend={ff.betas.alpha > 0 ? "up" : "down"} />
                  </div>
                </div>
              )}

              {/* Fundamentals */}
              {val && (
                <div className="glass-panel rounded-[2rem] p-8 shadow-xl">
                  <SectionHeader icon={DollarSign} label="Fundamentals" sub="Valuation & Quality Metrics" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <MetricCard label="P/E Ratio" value={fmt(val.peRatio, 1)} sub="Earnings Multiple" />
                    <MetricCard label="P/B Ratio" value={fmt(val.pbRatio, 2)} sub="Book Multiple" />
                    <MetricCard label="ROE" value={pct(val.roe)} sub="Return on Equity" highlight trend={val.roe && val.roe > 0.15 ? "up" : undefined} />
                    <MetricCard label="Debt/Eq" value={fmt(val.debtToEquity, 2)} sub="Leverage Ratio" />
                    <MetricCard label="Div Yield" value={pct(val.dividendYield)} sub="Annual Yield" />
                    <MetricCard label="Signal" value={val.valueSignal} sub="Investment Style" />
                  </div>
                </div>
              )}
            </div>

            {/* Risk & Momentum Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Risk Metrics */}
              <div className="glass-panel rounded-[2rem] p-8 shadow-xl">
                <SectionHeader icon={Shield} label="Risk Analysis" sub="Volatility & Tail Risk" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {vol && <MetricCard label="Sharpe" value={fmt(vol.sharpeRatio)} sub="Risk-Adj. Return" highlight trend={vol.sharpeRatio > 1 ? "up" : undefined} />}
                  {analysis.riskMetrics && (
                    <>
                      <MetricCard label="VaR (95%)" value={pct(analysis.riskMetrics.var95)} sub="Max Daily Loss" />
                      <MetricCard label="CVaR (95%)" value={pct(analysis.riskMetrics.cvar95)} sub="Expected Tail Loss" />
                      <MetricCard label="GARCH Vol" value={pct(analysis.riskMetrics.garchVol)} sub="Dynamic Vol" />
                    </>
                  )}
                  {vol && <MetricCard label="Ann. Vol" value={pct(vol.annualizedVolatility)} sub="Yearly Sigma" />}
                  {vol && <MetricCard label="Risk Level" value={vol.riskLevel} sub="Categorization" />}
                </div>
              </div>

              {/* Momentum & Sizing */}
              <div className="glass-panel rounded-[2rem] p-8 shadow-xl">
                <SectionHeader icon={Activity} label="Momentum & Sizing" sub="Trend Analysis & Allocation" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {mom && (
                    <>
                      <MetricCard label="12M Mom" value={pct(mom.momentum12M - 1)} sub="Yearly Trend" highlight trend={mom.momentum12M > 1 ? "up" : "down"} />
                      <MetricCard label="3M Mom" value={pct(mom.momentum3M - 1)} sub="Quarterly Trend" trend={mom.momentum3M > 1 ? "up" : "down"} />
                      <MetricCard label="Signal" value={mom.signal} sub="Trend Status" />
                    </>
                  )}
                  {analysis.kelly && (
                    <>
                      <MetricCard label="Kelly (Half)" value={`${(analysis.kelly.halfKelly * 100).toFixed(1)}%`} sub="Optimized Stake" highlight />
                      <MetricCard label="Kelly (Full)" value={`${(analysis.kelly.fullKelly * 100).toFixed(1)}%`} sub="Max Theoretical" />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center pt-12 pb-8 opacity-30">
        <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-text-secondary">
          Analyzed {new Date(analysis.analyzedAt).toLocaleString()} · Institutional Grade Engine
        </p>
      </div>
    </div>
  );
}
