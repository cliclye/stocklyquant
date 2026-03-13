"use client";
import { useState, useEffect, useRef } from "react";
import { Search, Loader2, AlertCircle, X } from "lucide-react";
import type { StockSearchResult, QuantAnalysis, ProgressEvent } from "@/lib/types";
import { useApp } from "@/lib/context";
import StockDetail from "./StockDetail";

const STAGES = [
  "Fetching Stock Data...",
  "Claude Researching...",
  "Selecting Best Formula...",
  "Calculating...",
  "Generating Report...",
];

export default function StockSearch() {
  const { apiKeys, setCurrentAnalysis, currentAnalysis, setActiveTab, envKeysSet } = useApp();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingStage, setLoadingStage] = useState("Fetching Stock Data...");
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Listen for watchlist → analyze events
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

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!hasKeys) return;
      setLoadingSuggestions(true);
      try {
        const keyParam = envKeysSet ? "" : `&key=${encodeURIComponent(apiKeys.polygon)}`;
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}${keyParam}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
      } catch {
        // ignore
      } finally {
        setLoadingSuggestions(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, hasKeys, apiKeys.polygon, envKeysSet]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function analyze(ticker: string) {
    if (!ticker.trim()) return;
    setSuggestions([]);
    setQuery(ticker);
    setError("");
    setAnalyzing(true);
    setLoadingStage("Fetching Stock Data...");
    setCurrentAnalysis(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker,
          polygonKey: apiKeys.polygon,
          fmpKey: apiKeys.fmp,
          claudeKey: apiKeys.claude || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        // Non-streaming error (e.g. 400 for missing ticker/keys)
        const data = await res.json().catch(() => ({ error: "Analysis failed" }));
        setError(data.error ?? "Analysis failed");
        setAnalyzing(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by double newlines
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;

          let event: ProgressEvent;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          switch (event.stage) {
            case "fetching":
              setLoadingStage("Fetching Stock Data...");
              break;
            case "researching":
              setLoadingStage("Claude Researching...");
              break;
            case "selecting":
              setLoadingStage("Selecting Best Formula...");
              break;
            case "calculating":
              setLoadingStage("Calculating...");
              break;
            case "reporting":
              setLoadingStage("Generating Report...");
              break;
            case "complete":
              if (event.result) setCurrentAnalysis(event.result as QuantAnalysis);
              setAnalyzing(false);
              break;
            case "error":
              setError(event.error ?? "Analysis failed");
              setAnalyzing(false);
              break;
          }
        }
      }
    } catch {
      setError("Network error. Please try again.");
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Search bar */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm px-4 pt-6 pb-4">
        {!hasKeys && (
          <div className="mb-4 flex items-start gap-3 bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-3">
            <AlertCircle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-300">
              API keys are required.{" "}
              <button
                onClick={() => setActiveTab("settings")}
                className="underline hover:text-yellow-200"
              >
                Go to Settings
              </button>{" "}
              to add your Polygon and FMP keys.
            </p>
          </div>
        )}
        <div ref={wrapperRef} className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && analyze(query.trim())}
                placeholder="Search ticker or company..."
                className="w-full bg-gray-800 text-white rounded-xl pl-9 pr-9 py-3 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none"
                disabled={!hasKeys || analyzing}
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setSuggestions([]); setCurrentAnalysis(null); setError(""); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <button
              onClick={() => analyze(query.trim())}
              disabled={!query.trim() || !hasKeys || analyzing}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {analyzing ? <Loader2 size={15} className="animate-spin" /> : null}
              {analyzing ? "Analyzing..." : "Analyze"}
            </button>
          </div>

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden z-50 shadow-xl">
              {loadingSuggestions ? (
                <div className="p-3 flex justify-center">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                </div>
              ) : (
                suggestions.slice(0, 8).map((s) => (
                  <button
                    key={s.ticker}
                    onClick={() => analyze(s.ticker)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700 transition-colors text-left border-b border-gray-700/50 last:border-0"
                  >
                    <div>
                      <span className="text-white font-semibold text-sm">{s.ticker}</span>
                      <span className="ml-2 text-gray-400 text-sm">{s.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{s.exchange}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {error && (
          <div className="mx-4 mb-4 flex items-start gap-3 bg-red-900/30 border border-red-700/50 rounded-xl p-4">
            <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {analyzing && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <Loader2 size={36} className="animate-spin text-blue-400 mb-5" />
            <p className="text-white font-semibold text-base mb-1">{loadingStage}</p>
            <p className="text-gray-500 text-xs mb-6">
              {loadingStage === "Fetching Stock Data..." && "Pulling price history & fundamentals..."}
              {loadingStage === "Claude Researching..." && "Analyzing company profile, earnings & sector trends..."}
              {loadingStage === "Selecting Best Formula..." && "Identifying the optimal quantitative model..."}
              {loadingStage === "Calculating..." && "Running Fama-French, VaR, GARCH, Kelly & more..."}
              {loadingStage === "Generating Report..." && "Assembling your analysis report..."}
            </p>
            {/* Stage progress dots */}
            <div className="flex items-center gap-2">
              {STAGES.map((stage) => (
                <div
                  key={stage}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    stage === loadingStage
                      ? "w-6 bg-blue-400"
                      : STAGES.indexOf(stage) < STAGES.indexOf(loadingStage)
                      ? "w-3 bg-blue-600"
                      : "w-3 bg-gray-700"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {!analyzing && currentAnalysis && (
          <StockDetail analysis={currentAnalysis} />
        )}

        {!analyzing && !currentAnalysis && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-900/30 border border-blue-700/30 flex items-center justify-center mb-5">
              <Search size={28} className="text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Search Any Stock</h2>
            <p className="text-gray-400 text-sm max-w-xs">
              Enter a ticker symbol to run a full Fama-French five-factor quantitative analysis with optional AI insights.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {["AAPL", "MSFT", "TSLA", "NVDA", "AMZN", "META"].map((t) => (
                <button
                  key={t}
                  onClick={() => analyze(t)}
                  disabled={!hasKeys}
                  className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded-lg border border-gray-700 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
