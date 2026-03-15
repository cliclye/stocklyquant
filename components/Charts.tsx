"use client";
import React from "react";
import {
  LineChart,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { PricePrediction, PricePoint, QuantPricePath } from "@/lib/types";

interface PriceChartProps {
  data: PricePoint[];
}

export function PriceChart({ data }: PriceChartProps) {
  if (!data.length) return null;

  const first = data[0].price;
  const isPositive = data[data.length - 1].price >= first;
  const color = isPositive ? "#10b981" : "#ef4444";

  // Show last 252 trading days max for clarity
  const display = data.slice(-252).filter((_, i, arr) => {
    // Thin out to max ~120 points for performance
    return arr.length <= 120 || i % Math.ceil(arr.length / 120) === 0 || i === arr.length - 1;
  });

  const min = Math.min(...display.map((d) => d.price));
  const max = Math.max(...display.map((d) => d.price));
  const pad = (max - min) * 0.05;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={display} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          tickFormatter={(v: string) => {
            const d = new Date(v);
            return `${d.toLocaleString("default", { month: "short" })} ${d.getFullYear().toString().slice(2)}`;
          }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[min - pad, max + pad]}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
          labelStyle={{ color: "#9ca3af" }}
          itemStyle={{ color }}
          formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
          labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Prediction Chart ─────────────────────────────────────────────────────────

interface PredictionChartProps {
  prediction: PricePrediction;
}

export function PredictionChart({ prediction }: PredictionChartProps) {
  if (!prediction.points.length) return null;

  // Find the boundary date (last historical point before forecast starts)
  const lastActualDate = prediction.points
    .filter((p) => p.actual !== undefined)
    .at(-1)?.date ?? "";

  // Build display data: add bandWidth for stacked CI area
  // bandWidth = upper95 - lower95 (stacked on top of lower95 to create the band)
  const display = prediction.points.map((p) => ({
    ...p,
    bandWidth:
      p.upper95 !== undefined && p.lower95 !== undefined
        ? parseFloat((p.upper95 - p.lower95).toFixed(2))
        : undefined,
  }));

  // Compute Y-axis domain across all values
  const allVals: number[] = display.flatMap((p) =>
    [p.actual, p.upper95, p.lower95, p.expected, p.bull, p.bear].filter(
      (v): v is number => v !== undefined
    )
  );
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const pad = (yMax - yMin) * 0.08;

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.toLocaleString("default", { month: "short" })} ${dt.getDate()}`;
  };

  const exp30 = prediction.expectedReturn30d;
  const expColor = exp30 >= 0 ? "#10b981" : "#ef4444";

  return (
    <div>
      {/* Summary stats row */}
      <div className="flex gap-3 mb-3 flex-wrap">
        <div className="flex-1 min-w-0 bg-surface-highlight/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-text-secondary mb-0.5">30-Day Expected</p>
          <p className={`text-sm font-bold ${expColor}`}>
            {exp30 >= 0 ? "+" : ""}{(exp30 * 100).toFixed(1)}%
          </p>
        </div>
        <div className="flex-1 min-w-0 bg-surface-highlight/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-text-secondary mb-0.5">95% CI Upper</p>
          <p className="text-sm font-bold text-blue-400">
            +{(prediction.upperBound30d * 100).toFixed(1)}%
          </p>
        </div>
        <div className="flex-1 min-w-0 bg-surface-highlight/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-text-secondary mb-0.5">95% CI Lower</p>
          <p className="text-sm font-bold text-orange-400">
            {(prediction.lowerBound30d * 100).toFixed(1)}%
          </p>
        </div>
        <div className="flex-1 min-w-0 bg-surface-highlight/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-text-secondary mb-0.5">Daily Vol</p>
          <p className="text-sm font-bold text-text-primary">
            {(prediction.dailyVol * 100).toFixed(2)}%
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={display} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />

          <XAxis
            dataKey="date"
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[yMin - pad, yMax + pad]}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            width={56}
          />

          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#9ca3af" }}
            labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                actual: "Actual",
                expected: "Expected",
                bull: "Bull",
                bear: "Bear",
                lower95: "CI Lower (95%)",
                bandWidth: "CI Band",
              };
              return [`$${value.toFixed(2)}`, labels[name] ?? name];
            }}
          />

          {/* Vertical reference line at today (history/forecast boundary) */}
          {lastActualDate && (
            <ReferenceLine
              x={lastActualDate}
              stroke="#4b5563"
              strokeDasharray="4 4"
              label={{ value: "Today", fill: "#6b7280", fontSize: 10, position: "insideTopRight" }}
            />
          )}

          {/* 95% CI band: stacked area (lower95 as base, bandWidth as fill) */}
          <Area
            type="monotone"
            dataKey="lower95"
            stackId="ci"
            stroke="none"
            fill="none"
            dot={false}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="bandWidth"
            stackId="ci"
            stroke="none"
            fill="rgba(59,130,246,0.12)"
            dot={false}
            name="bandWidth"
          />

          {/* Bull scenario */}
          <Line
            type="monotone"
            dataKey="bull"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            name="bull"
          />

          {/* Bear scenario */}
          <Line
            type="monotone"
            dataKey="bear"
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            name="bear"
          />

          {/* Expected / median forecast */}
          <Line
            type="monotone"
            dataKey="expected"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="expected"
          />

          {/* Historical actual prices */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#e5e7eb"
            strokeWidth={2}
            dot={false}
            name="actual"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
        {[
          { color: "#e5e7eb", label: "Actual" },
          { color: "#3b82f6", label: "Expected (GBM)" },
          { color: "#10b981", label: "Bull (+0.5σ)", dashed: true },
          { color: "#f97316", label: "Bear (−0.5σ)", dashed: true },
          { color: "rgba(59,130,246,0.4)", label: "95% CI Band", swatch: true },
        ].map(({ color, label, dashed, swatch }) => (
          <div key={label} className="flex items-center gap-1.5">
            {swatch ? (
              <div className="w-4 h-3 rounded-sm" style={{ background: color }} />
            ) : (
              <svg width="16" height="4">
                <line
                  x1="0" y1="2" x2="16" y2="2"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray={dashed ? "4 2" : undefined}
                />
              </svg>
            )}
            <span className="text-xs text-text-secondary">{label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-secondary/40 mt-2 text-center">
        {prediction.formulaUsed} · 30-day forward · Not financial advice
      </p>
    </div>
  );
}

// ─── Quant Prediction Chart (single composite line) ──────────────────────────

interface QuantPredictionChartProps {
  path: QuantPricePath;
}

export function QuantPredictionChart({ path }: QuantPredictionChartProps) {
  const [showMath, setShowMath] = React.useState(false);
  if (!path?.points?.length) return null;

  const lastActualDate = path.points.filter((p) => p.actual !== undefined).at(-1)?.date ?? "";

  const allVals: number[] = path.points.flatMap((p) =>
    [p.actual, p.quant].filter((v): v is number => v !== undefined)
  );
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const pad = (yMax - yMin) * 0.12;

  const exp30 = path.expectedReturn30d || 0;
  const expColor = exp30 >= 0 ? "#22d3ee" : "#fb7185";

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.toLocaleString("default", { month: "short" })} ${dt.getDate()}`;
  };

  const signals = path.signals || {
    ff5Weight: 0, ff5AnnualReturn: 0,
    momentumWeight: 0, momentum3MAnnualised: 0,
    macroWeight: 0, macroAnnualReturn: 0,
    riskWeight: 0, riskAdjustedAnnualReturn: 0,
    scoreWeight: 0, scoreAlphaAnnual: 0,
    compositeDailyReturn: 0
  };

  const signalRows = [
    { label: "Formula Alpha", weight: signals.ff5Weight, val: signals.ff5AnnualReturn, color: "from-blue-500 to-indigo-600" },
    { label: "Momentum", weight: signals.momentumWeight, val: signals.momentum3MAnnualised, color: "from-emerald-500 to-teal-600" },
    { label: "Macro Impact", weight: signals.macroWeight, val: signals.macroAnnualReturn, color: "from-amber-500 to-orange-600" },
    { label: "Risk Regime", weight: signals.riskWeight, val: signals.riskAdjustedAnnualReturn, color: "from-rose-500 to-red-600" },
    { label: "Score Alpha", weight: signals.scoreWeight, val: signals.scoreAlphaAnnual, color: "from-purple-500 to-fuchsia-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface/40 border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-text-secondary">30-Day Quant Forecast</h4>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-highlight text-text-secondary`}>
              Deterministic
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold tracking-tight" style={{ color: expColor }}>
              {exp30 >= 0 ? "+" : ""}{(exp30 * 100).toFixed(2)}%
            </span>
            <span className="text-lg text-text-secondary font-medium">
              → ${(path.currentPrice * (1 + exp30)).toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-text-secondary/60 mt-2 italic">
            Computed via {signalRows.length}-factor composite drift model
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {signalRows.slice(0, 4).map((s) => (
            <div key={s.label} className="bg-surface/40 border border-border rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">{s.label}</span>
              <span className={`text-sm font-bold ${s.val >= 0 ? "text-text-primary" : "text-rose-400"}`}>
                {s.val >= 0 ? "+" : ""}{(s.val * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-surface/20 border border-border/30 rounded-2xl p-4">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={path.points} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickFormatter={fmtDate}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[yMin - pad, yMax + pad]}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)" }}
              labelStyle={{ color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}
              labelFormatter={(label: string) => new Date(label).toLocaleDateString(undefined, { dateStyle: "long" })}
              formatter={(value: number, name: string) => [
                <span key="val" className="font-bold text-gray-100">${value.toFixed(2)}</span>,
                <span key="name" className="text-gray-500">{name === "actual" ? "Historical Close" : "Quant Projection"}</span>
              ]}
            />
            {lastActualDate && (
              <ReferenceLine x={lastActualDate} stroke="#334155" strokeDasharray="5 5" />
            )}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#475569"
              strokeWidth={2}
              dot={false}
              name="actual"
            />
            <Line
              type="monotone"
              dataKey="quant"
              stroke="#22d3ee"
              strokeWidth={3}
              dot={false}
              name="quant"
              strokeDasharray="8 4"
              animationDuration={1500}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Show Math Toggle */}
      <div className="flex flex-col items-center">
        <button
          onClick={() => setShowMath(!showMath)}
          className="text-[10px] uppercase font-bold tracking-widest text-text-secondary hover:text-white transition-colors flex items-center gap-2"
        >
          {showMath ? "Hide Methodology" : "Show Mathematical Breakdown"}
          <svg className={`w-3 h-3 transition-transform ${showMath ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showMath && (
          <div className="mt-6 w-full bg-surface/60 border border-border rounded-2xl p-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <h5 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Signal Weighting & Drift Calculation</h5>
            <div className="space-y-4">
              {signalRows.map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-text-secondary font-medium">{s.label}</span>
                    <span className="text-text-secondary/60">{(s.weight * 100).toFixed(0)}% Weight × {(s.val * 100).toFixed(2)}% Ann.</span>
                  </div>
                  <div className="h-1.5 bg-surface-highlight rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${s.color} rounded-full`}
                      style={{ width: `${s.weight * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border font-mono text-[11px] text-text-secondary leading-relaxed">
              <p className="mb-2 text-text-primary font-bold tracking-tight uppercase">Formula Synthesis:</p>
              <p className="bg-black/30 p-3 rounded-lg border border-border/50">
                Daily Drift (μ) = Σ (wᵢ × rᵢ / 252) <br />
                μ = ({signals.ff5Weight} × {signals.ff5AnnualReturn.toFixed(4)}) +
                ({signals.momentumWeight} × {signals.momentum3MAnnualised.toFixed(4)}) +
                ({signals.macroWeight} × {signals.macroAnnualReturn.toFixed(4)}) +
                ({signals.riskWeight} × {signals.riskAdjustedAnnualReturn.toFixed(4)}) +
                ({signals.scoreWeight} × {signals.scoreAlphaAnnual.toFixed(4)}) / 252 <br />
                <span className="text-cyan-400 font-bold">μ = {(signals.compositeDailyReturn * 100).toFixed(5)}% per trading day</span>
              </p>
              <p className="mt-4">
                Projection Model: S(t) = S₀ × (1 + μ)ᵗ <br />
                Target (30d) = ${path.currentPrice.toFixed(2)} × (1 + {signals.compositeDailyReturn.toFixed(6)})³⁰ = <span className="text-white">${(path.currentPrice * (1 + path.expectedReturn30d)).toFixed(2)}</span>
              </p>
            </div>

            {path.correlations && path.correlations.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <h5 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Peer Industry Correlations (Top 10)</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {path.correlations.map((c) => (
                    <div key={c.ticker} className="bg-black/20 border border-border/50 rounded-xl p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-text-primary">{c.ticker}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.impact === "Positive" ? "bg-emerald-500/10 text-emerald-400" :
                            c.impact === "Negative" ? "bg-rose-500/10 text-rose-400" :
                              "bg-surface-highlight/50 text-text-secondary"
                          }`}>
                          {c.impact} Impact
                        </span>
                      </div>
                      <p className="text-[10px] text-text-secondary/60 leading-relaxed">{c.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-text-secondary/40 text-center uppercase tracking-widest font-medium">
        {path.methodology}
      </p>
    </div>
  );
}

