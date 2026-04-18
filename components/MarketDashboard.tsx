"use client";
import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Activity, Globe, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/context";

interface IndexData { ticker: string; price: number; change: number; changePct: number; }

const INDEX_INFO: Record<string, { name: string }> = {
  SPY: { name: "S&P 500"     },
  QQQ: { name: "Nasdaq 100"  },
  DIA: { name: "Dow Jones"   },
  IWM: { name: "Russell 2000"},
  VXX: { name: "Volatility"  },
};

export default function MarketDashboard() {
  const { apiKeys, envKeysSet } = useApp();
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const hasKeys = Boolean(envKeysSet || apiKeys.polygon);

  async function load() {
    if (!hasKeys) return;
    setLoading(true); setError("");
    try {
      const keyParam = envKeysSet ? "" : `?key=${encodeURIComponent(apiKeys.polygon)}`;
      const res = await fetch(`/api/market${keyParam}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setIndices(data.indices ?? []);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load market data");
    } finally { setLoading(false); }
  }

  useEffect(() => { if (hasKeys) load(); }, [hasKeys]); // eslint-disable-line

  if (!hasKeys) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <Globe size={24} className="text-amber-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-200 mb-2">Market Data Unavailable</h3>
        <p className="text-slate-500 text-sm max-w-xs">Configure your Polygon API key in Settings.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Global Markets</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              Live {lastUpdated && `· ${lastUpdated.toLocaleTimeString()}`}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 mb-5 text-rose-400 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading && indices.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-32 animate-pulse" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {indices.map((idx) => {
          const isPos = idx.changePct >= 0;
          const info = INDEX_INFO[idx.ticker] ?? { name: idx.ticker };
          return (
            <div
              key={idx.ticker}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-black text-slate-50 text-base leading-none">{idx.ticker}</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-semibold">{info.name}</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-50 tabular-nums mb-1">
                ${idx.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className={`flex items-center gap-1 text-sm font-bold ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                {isPos ? <TrendingUp size={13} strokeWidth={2.5} /> : <TrendingDown size={13} strokeWidth={2.5} />}
                {isPos ? "+" : ""}{idx.changePct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
