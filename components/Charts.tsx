"use client";
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
import type { PricePrediction, PricePoint } from "@/lib/types";

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
    <ResponsiveContainer width="100%" height={220}>
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
        <div className="flex-1 min-w-0 bg-gray-900/60 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">30-Day Expected</p>
          <p className={`text-sm font-bold ${expColor}`}>
            {exp30 >= 0 ? "+" : ""}{(exp30 * 100).toFixed(1)}%
          </p>
        </div>
        <div className="flex-1 min-w-0 bg-gray-900/60 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">95% CI Upper</p>
          <p className="text-sm font-bold text-blue-400">
            +{(prediction.upperBound30d * 100).toFixed(1)}%
          </p>
        </div>
        <div className="flex-1 min-w-0 bg-gray-900/60 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">95% CI Lower</p>
          <p className="text-sm font-bold text-orange-400">
            {(prediction.lowerBound30d * 100).toFixed(1)}%
          </p>
        </div>
        <div className="flex-1 min-w-0 bg-gray-900/60 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Daily Vol</p>
          <p className="text-sm font-bold text-gray-300">
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
                actual:    "Actual",
                expected:  "Expected",
                bull:      "Bull",
                bear:      "Bear",
                lower95:   "CI Lower (95%)",
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
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600 mt-2 text-center">
        {prediction.formulaUsed} · 30-day forward · Not financial advice
      </p>
    </div>
  );
}
