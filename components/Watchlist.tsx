"use client";
import { Trash2, TrendingUp, Calendar, ArrowRight, Plus } from "lucide-react";
import { useApp } from "@/lib/context";

const scoreColor = (score?: number) => {
  if (score === undefined) return "text-slate-400";
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-cyan-400";
  if (score >= 40) return "text-amber-400";
  return "text-rose-400";
};

export default function Watchlist() {
  const { watchlist, removeFromWatchlist, setActiveTab } = useApp();

  if (watchlist.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-5">
          <TrendingUp size={28} className="text-slate-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-200 mb-2">Watchlist is empty</h2>
        <p className="text-slate-500 text-sm max-w-xs mb-6">
          Search for a stock and bookmark it to track it here.
        </p>
        <button
          onClick={() => setActiveTab("search")}
          className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg transition-colors text-sm"
        >
          <Plus size={16} strokeWidth={2.5} /> Find Stocks
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Watchlist</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Tracking {watchlist.length} stock{watchlist.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setActiveTab("search")}
          className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} /> Add
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {watchlist.map((item) => (
          <div
            key={item.id}
            className="group bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors relative"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sm text-slate-300">
                {item.ticker.slice(0, 2)}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.ticker); }}
                className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <button
              onClick={() => window.dispatchEvent(new CustomEvent("sq:analyze", { detail: { ticker: item.ticker } }))}
              className="w-full text-left"
            >
              <h3 className="text-lg font-black text-slate-50 tracking-tight mb-0.5">{item.ticker}</h3>
              <div className="flex items-center gap-1 text-[10px] text-slate-600 uppercase tracking-wider mb-4">
                <Calendar size={9} />
                {new Date(item.addedDate).toLocaleDateString()}
              </div>

              <div className="flex items-end justify-between pt-3 border-t border-slate-800">
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Price</p>
                  <p className="text-base font-bold text-slate-200 tabular-nums">
                    {item.lastPrice != null ? `$${item.lastPrice.toFixed(2)}` : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Score</p>
                  <p className={`text-base font-black tabular-nums ${scoreColor(item.lastQuantScore)}`}>
                    {item.lastQuantScore != null ? item.lastQuantScore.toFixed(0) : "—"}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight size={14} className="text-slate-500" />
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
