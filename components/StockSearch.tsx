"use client";
import { useState, useEffect, useRef } from "react";
import { Search, Loader2, AlertCircle, X, ArrowRight, Zap, CheckCircle2 } from "lucide-react";
import type { StockSearchResult, QuantAnalysis, ProgressEvent } from "@/lib/types";
import { appendPredictionFromAnalysis } from "@/lib/localAccuracy";
import { useApp } from "@/lib/context";
import StockDetail from "./StockDetail";

const STAGES = [
  "Fetching Stock Data...",
  "Claude Researching...",
  "Selecting Best Formula...",
  "Calculating...",
  "Generating Report...",
];

interface SearchInputProps {
  large?: boolean;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  suggestions: StockSearchResult[];
  setSuggestions: React.Dispatch<React.SetStateAction<StockSearchResult[]>>;
  loadingSuggestions: boolean;
  searchError: string;
  setSearchError: React.Dispatch<React.SetStateAction<string>>;
  hasKeys: boolean | string;
  analyzing: boolean;
  analyze: (ticker: string) => void;
  setCurrentAnalysis: (a: QuantAnalysis | null) => void;
  setError: React.Dispatch<React.SetStateAction<string>>;
}

function SearchInput({
  large = false,
  wrapperRef,
  query,
  setQuery,
  suggestions,
  setSuggestions,
  loadingSuggestions,
  searchError,
  setSearchError,
  hasKeys,
  analyzing,
  analyze,
  setCurrentAnalysis,
  setError,
}: SearchInputProps) {
  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl mx-auto">
      <div className="relative flex items-center">
        <Search
          size={large ? 18 : 16}
          className="absolute left-3.5 text-slate-500 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setSearchError("");
            setQuery(e.target.value.toUpperCase());
          }}
          onKeyDown={(e) => e.key === "Enter" && analyze(query.trim())}
          placeholder="Search ticker (e.g. AAPL, NVDA)..."
          className={`w-full bg-slate-900 text-slate-50 border border-slate-700 rounded-lg
            focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500
            placeholder:text-slate-500 transition-colors
            ${large ? "pl-10 pr-10 py-3 text-base" : "pl-9 pr-8 py-2 text-sm"}`}
          disabled={!hasKeys || analyzing}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setSearchError("");
              setCurrentAnalysis(null);
              setError("");
            }}
            className="absolute right-3 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown (show while loading so the panel is not silently empty) */}
      {(loadingSuggestions || suggestions.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-2xl shadow-black/50 z-50">
          {loadingSuggestions ? (
            <div className="p-3 flex justify-center">
              <Loader2 size={16} className="animate-spin text-cyan-500" />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">No tickers found</div>
          ) : (
            suggestions.slice(0, 6).map((s) => (
              <button
                key={s.ticker}
                onClick={() => analyze(s.ticker)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800 transition-colors text-left border-b border-slate-800 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="w-12 text-center font-bold text-xs text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                    {s.ticker}
                  </span>
                  <span className="text-slate-300 text-sm truncate max-w-[200px]">{s.name}</span>
                </div>
                <span className="text-xs text-slate-500 uppercase font-medium tracking-wider">
                  {s.exchange}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {searchError && (
        <p className="mt-2 text-left text-xs font-medium text-rose-400 flex items-start gap-1.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{searchError}</span>
        </p>
      )}
    </div>
  );
}

export default function StockSearch() {
  const { apiKeys, setCurrentAnalysis, currentAnalysis, setActiveTab, envKeysSet } = useApp();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingStage, setLoadingStage] = useState("Fetching Stock Data...");
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: Event) {
      const { ticker } = (e as CustomEvent).detail as { ticker: string };
      analyze(ticker);
    }
    window.addEventListener("sq:fill-ticker", handler);
    return () => window.removeEventListener("sq:fill-ticker", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeys, envKeysSet]);

  const hasKeys = envKeysSet || (apiKeys.polygon && apiKeys.fmp);

  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setSuggestions([]);
      setSearchError("");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!hasKeys) return;
      setLoadingSuggestions(true);
      setSearchError("");
      try {
        const keyParam = envKeysSet ? "" : `&key=${encodeURIComponent(apiKeys.polygon)}`;
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}${keyParam}`);
        let data: { results?: StockSearchResult[]; error?: string };
        try {
          data = await res.json();
        } catch {
          const msg = `Search failed: could not read response (HTTP ${res.status})`;
          console.error("[StockSearch]", msg);
          setSuggestions([]);
          setSearchError(msg);
          return;
        }
        if (!res.ok) {
          const msg = data.error ?? `Ticker search failed (HTTP ${res.status})`;
          console.error("[StockSearch] Search API error:", res.status, data);
          setSuggestions([]);
          setSearchError(msg);
          return;
        }
        setSuggestions(data.results ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error while searching";
        console.error("[StockSearch] Search fetch failed:", e);
        setSuggestions([]);
        setSearchError(msg);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, hasKeys, apiKeys.polygon, envKeysSet]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setSuggestions([]);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function analyze(ticker: string) {
    if (!ticker.trim()) return;
    setSuggestions([]);
    setQuery(ticker);
    setError("");
    setSearchError("");
    setAnalyzing(true);
    setLoadingStage("Fetching Stock Data...");
    setCurrentAnalysis(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, polygonKey: apiKeys.polygon, fmpKey: apiKeys.fmp, claudeKey: apiKeys.claude || undefined }),
      });

      if (!res.ok) {
        const raw = await res.text();
        let message = `Analysis request failed (HTTP ${res.status})`;
        try {
          const data = JSON.parse(raw) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          if (raw.trim()) message = raw.trim().slice(0, 200);
        }
        console.error("[StockSearch] /api/analyze rejected:", res.status, raw.slice(0, 500));
        setError(message);
        setAnalyzing(false);
        return;
      }

      if (!res.body) {
        const msg = "Analysis returned no response body.";
        console.error("[StockSearch]", msg);
        setError(msg);
        setAnalyzing(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamFinished = false;

      function applyProgressEvent(event: ProgressEvent) {
        switch (event.stage) {
          case "fetching":    setLoadingStage("Fetching Stock Data..."); break;
          case "researching": setLoadingStage("Claude Researching..."); break;
          case "selecting":   setLoadingStage("Selecting Best Formula..."); break;
          case "calculating": setLoadingStage("Calculating..."); break;
          case "reporting":   setLoadingStage("Generating Report..."); break;
          case "complete":
            if (event.result) {
              const analysis = event.result as QuantAnalysis;
              setCurrentAnalysis(analysis);
              appendPredictionFromAnalysis(analysis);
            } else {
              const msg = "Analysis completed but returned no report data.";
              console.error("[StockSearch] SSE complete without result:", event);
              setError(msg);
            }
            streamFinished = true;
            setAnalyzing(false);
            break;
          case "error":
            setError(event.error ?? "Analysis failed");
            streamFinished = true;
            setAnalyzing(false);
            break;
        }
      }

      /** Split on SSE event boundaries; the last segment may be an incomplete frame. */
      function consumeFullSseEvents(text: string): string {
        const parts = text.split("\n\n");
        const tail = parts.pop() ?? "";
        for (const chunk of parts) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            applyProgressEvent(JSON.parse(line) as ProgressEvent);
          } catch (parseErr) {
            console.error("[StockSearch] Bad SSE JSON chunk:", line.slice(0, 200), parseErr);
            setError("Received invalid data from the analysis server.");
            streamFinished = true;
            setAnalyzing(false);
          }
        }
        return tail;
      }

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        buffer = consumeFullSseEvents(buffer);
        if (done) break;
      }

      // Final frame often arrives without a trailing blank line — flush it.
      if (buffer.trim()) {
        const line = buffer.replace(/^data: /, "").trim();
        if (line) {
          try {
            applyProgressEvent(JSON.parse(line) as ProgressEvent);
          } catch (parseErr) {
            console.error("[StockSearch] Bad SSE tail:", line.slice(0, 200), parseErr);
            setError("Received invalid data from the analysis server.");
            streamFinished = true;
            setAnalyzing(false);
          }
        }
      }

      if (!streamFinished) {
        const msg = "Analysis stream ended before completion.";
        console.error("[StockSearch]", msg);
        setError(msg);
        setAnalyzing(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error. Please try again.";
      console.error("[StockSearch] Analyze failed:", e);
      setError(msg);
      setAnalyzing(false);
    }
  }

  const searchInputProps = {
    wrapperRef, query, setQuery, suggestions, setSuggestions,
    loadingSuggestions, searchError, setSearchError, hasKeys, analyzing, analyze, setCurrentAnalysis, setError,
  };

  /* ── Hero State ─────────────────────────────────────────────────────────── */
  if (!analyzing && !currentAnalysis) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg text-center space-y-8">
          {/* Logo mark */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-xs font-semibold uppercase tracking-widest">
              <Zap size={11} fill="currentColor" /> Quant Engine v2.0
            </div>
            <h1 className="text-4xl font-bold text-slate-50 tracking-tight">
              Quant <span className="text-cyan-400">Alpha</span> Search
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Institutional-grade analysis powered by Fama-French 5-factor models,
              GBM simulations, and AI-driven macro risk assessment.
            </p>
          </div>

          <SearchInput large {...searchInputProps} />

          {error && (
            <div className="flex items-start gap-2 text-rose-400 text-xs font-medium bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-left">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!hasKeys && (
            <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 text-left">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-400">API Keys Required</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure your Polygon and FMP keys in{" "}
                  <button onClick={() => setActiveTab("settings")} className="text-cyan-400 underline">Settings</button>.
                </p>
              </div>
            </div>
          )}

          {/* Trending tickers */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Trending</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["NVDA", "TSLA", "AAPL", "AMD", "PLTR", "MSFT"].map((t) => (
                <button
                  key={t}
                  onClick={() => analyze(t)}
                  disabled={!hasKeys}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600
                    rounded-md text-sm font-medium text-slate-300 hover:text-slate-50 transition-colors disabled:opacity-40"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Loading State ──────────────────────────────────────────────────────── */
  if (analyzing) {
    const stageIdx = Math.max(STAGES.indexOf(loadingStage), 0);
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Spinner */}
          <div className="flex justify-center">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-2 border-slate-800" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Zap size={20} className="text-cyan-500" fill="currentColor" />
              </div>
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-semibold text-slate-50">{loadingStage}</h3>
            <p className="text-slate-500 text-sm mt-1">Processing market data…</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-1">
            <div
              className="h-1 bg-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${(stageIdx / (STAGES.length - 1)) * 100}%` }}
            />
          </div>

          {/* Stage list */}
          <div className="space-y-2 bg-slate-900 border border-slate-800 rounded-lg p-4">
            {STAGES.map((stage, idx) => {
              const isActive = stage === loadingStage;
              const isDone = stageIdx > idx;
              return (
                <div key={stage} className={`flex items-center gap-2.5 text-sm ${
                  isActive ? "text-cyan-400 font-medium"
                  : isDone  ? "text-emerald-400"
                  : "text-slate-600"
                }`}>
                  {isDone
                    ? <CheckCircle2 size={14} />
                    : <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isActive ? "border-cyan-500" : "border-slate-700"
                      }`}>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />}
                      </div>
                  }
                  {stage}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ── Results State ──────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full">
      {/* Sticky header with search */}
      <div className="sticky top-0 z-20 bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center gap-4">
        <div className="flex-1 max-w-md">
          <SearchInput {...searchInputProps} />
        </div>
        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-xs font-medium bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-md">
            <AlertCircle size={13} /> {error}
          </div>
        )}
      </div>

      {/* Scrollable results */}
      <div className="flex-1 overflow-y-auto">
        {currentAnalysis && <StockDetail analysis={currentAnalysis} />}
      </div>
    </div>
  );
}
