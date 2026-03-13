"use client";
import type { ClaudeAnalysis } from "@/lib/types";
import { Brain, BarChart2, Scale, Info } from "lucide-react";

interface Props {
  analysis: ClaudeAnalysis;
}

const FORMULA_COLORS: Record<string, string> = {
  CAPM: "bg-blue-900/50 text-blue-300 border-blue-700",
  FF3:  "bg-teal-900/50 text-teal-300 border-teal-700",
  FF5:  "bg-purple-900/50 text-purple-300 border-purple-700",
  APT:  "bg-orange-900/50 text-orange-300 border-orange-700",
};

const RISK_COLORS: Record<string, string> = {
  CVaR:   "bg-red-900/50 text-red-300 border-red-700",
  VaR:    "bg-orange-900/50 text-orange-300 border-orange-700",
  Sharpe: "bg-green-900/50 text-green-300 border-green-700",
  GARCH:  "bg-yellow-900/50 text-yellow-300 border-yellow-700",
};

function WeightBar({ label, value, color = "bg-blue-500" }: { label: string; value: number; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AIAnalysis({ analysis }: Props) {
  const formulaClass = FORMULA_COLORS[analysis.selectedFormula] ?? "bg-gray-800 text-gray-300 border-gray-600";
  const riskClass    = RISK_COLORS[analysis.riskMetric]          ?? "bg-gray-800 text-gray-300 border-gray-600";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain size={18} className="text-purple-400" />
          <span className="text-sm font-semibold text-purple-300">AI Formula Selection</span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Factor Model</p>
            <span className={`inline-block text-sm font-bold border rounded-lg px-2 py-0.5 ${formulaClass}`}>
              {analysis.selectedFormula}
            </span>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Risk Metric</p>
            <span className={`inline-block text-sm font-bold border rounded-lg px-2 py-0.5 ${riskClass}`}>
              {analysis.riskMetric}
            </span>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">AI-Adj. Score</p>
            <p className="text-lg font-bold text-white">{analysis.aiAdjustedScore.toFixed(0)}</p>
          </div>
        </div>

        <p className="text-xs text-purple-200/80 font-medium">{analysis.recommendedFormula}</p>
      </div>

      {/* Score Weights */}
      <div className="bg-gray-800/60 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Scale size={15} className="text-blue-400" />
          <h4 className="text-sm font-semibold text-gray-200">AI-Recommended Score Weights</h4>
        </div>
        <div className="space-y-3">
          <WeightBar label="Momentum"   value={analysis.scoreWeights.momentum}   color="bg-blue-500" />
          <WeightBar label="Value"      value={analysis.scoreWeights.value}      color="bg-teal-500" />
          <WeightBar label="Quality"    value={analysis.scoreWeights.quality}    color="bg-purple-500" />
          <WeightBar label="Size"       value={analysis.scoreWeights.size}       color="bg-orange-500" />
          <WeightBar label="Volatility" value={analysis.scoreWeights.volatility} color="bg-red-400" />
        </div>
      </div>

      {/* FF Factor Emphasis */}
      <div className="bg-gray-800/60 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={15} className="text-blue-400" />
          <h4 className="text-sm font-semibold text-gray-200">Factor Relevance for This Stock</h4>
        </div>
        <div className="space-y-3">
          <WeightBar label="Market (β₁)"          value={analysis.ffFactorEmphasis.market} color="bg-blue-500" />
          <WeightBar label="Size SMB (β₂)"        value={analysis.ffFactorEmphasis.smb}    color="bg-teal-500" />
          <WeightBar label="Value HML (β₃)"       value={analysis.ffFactorEmphasis.hml}    color="bg-yellow-500" />
          <WeightBar label="Profitability RMW (β₄)" value={analysis.ffFactorEmphasis.rmw} color="bg-purple-500" />
          <WeightBar label="Investment CMA (β₅)"  value={analysis.ffFactorEmphasis.cma}   color="bg-orange-500" />
        </div>
      </div>

      {/* Rationale */}
      {analysis.rationale && (
        <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
          <div className="flex gap-2 items-start">
            <Info size={14} className="text-gray-500 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-400 leading-relaxed">{analysis.rationale}</p>
          </div>
        </div>
      )}
    </div>
  );
}
