import { NextRequest, NextResponse } from "next/server";
import type {
  PolygonAggregateResponse,
  FMPProfile,
  FMPKeyMetrics,
  FMPRatios,
  FMPIncomeStatement,
  FMPBalanceSheet,
  PricePoint,
  DailyReturn,
  ValueMetrics,
  QuantAnalysis,
  ClaudeAnalysis,
  ProgressEvent,
} from "@/lib/types";
import {
  computeFamaFrenchFiveFactor,
  computeMomentum,
  computeVolatility,
  computeQuantScore,
  computeRiskMetrics,
  computeKelly,
  computePricePrediction,
  quantScoreLabel,
  computeReturnsFromPrices,
  ANNUAL_RISK_FREE_RATE,
} from "@/lib/quantCalculator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function polygonBarsToPoints(data: PolygonAggregateResponse): PricePoint[] {
  return (data.results ?? []).map((b) => ({
    date: new Date(b.t).toISOString().slice(0, 10),
    price: b.c,
    volume: b.v,
    open: b.o,
    high: b.h,
    low: b.l,
  }));
}

async function fetchPolygonBars(
  ticker: string,
  from: string,
  to: string,
  apiKey: string
): Promise<PricePoint[]> {
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker.toUpperCase()}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 403) throw new Error("Invalid Polygon API key");
  if (res.status === 429) throw new Error("Polygon rate limited");
  const data: PolygonAggregateResponse = await res.json();
  if (!data.results?.length) throw new Error(`No data for ${ticker}`);
  return polygonBarsToPoints(data);
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─── FMP helpers ──────────────────────────────────────────────────────────────

async function fmpGet<T>(path: string, fmpKey: string): Promise<T> {
  const res = await fetch(
    `https://financialmodelingprep.com/api/v3${path}?apikey=${fmpKey}`,
    { cache: "no-store" }
  );
  if (res.status === 403) throw new Error("Invalid FMP API key");
  return res.json();
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function fmtB(v: number | undefined | null) {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtNum(v: number | undefined | null, decimals = 1) {
  if (v == null) return "N/A";
  return v.toFixed(decimals);
}

// ─── Build Claude research prompt (raw company data, no pre-computed metrics) ─

function buildClaudeResearchPrompt(
  ticker: string,
  profile: FMPProfile | null,
  incomeStatements: FMPIncomeStatement[],
  balanceSheets: FMPBalanceSheet[],
  metricsArr: FMPKeyMetrics[],
  ratiosArr: FMPRatios[],
  return3M: number,
  return12M: number
): string {
  const lines: string[] = [];

  lines.push(`=== STOCK RESEARCH REQUEST: ${ticker} ===`);

  if (profile) {
    lines.push(`Company: ${profile.companyName}`);
    lines.push(`Sector: ${profile.sector ?? "Unknown"} | Industry: ${profile.industry ?? "Unknown"}`);
    lines.push(`Exchange: ${profile.exchange ?? "Unknown"} | Market Cap: ${fmtB(profile.mktCap ?? null)}`);
    if (profile.beta != null) lines.push(`Market Beta: ${fmtNum(profile.beta, 2)}`);
    if (profile.description) {
      lines.push(`Description: ${profile.description.slice(0, 400)}`);
    }
  }

  lines.push("\n=== RECENT PRICE PERFORMANCE ===");
  lines.push(`Last 3-Month Return: ${fmtPct(return3M)}`);
  lines.push(`Last 12-Month Return: ${fmtPct(return12M)}`);

  if (incomeStatements.length > 0) {
    lines.push("\n=== EARNINGS HISTORY (most recent annual periods) ===");
    for (const inc of incomeStatements.slice(0, 4)) {
      const margin =
        inc.revenue && inc.revenue > 0 && inc.operatingIncome != null
          ? ((inc.operatingIncome / inc.revenue) * 100).toFixed(1) + "%"
          : "N/A";
      lines.push(
        `${inc.date ?? "?"}: Revenue ${fmtB(inc.revenue ?? null)} | Net Income ${fmtB(inc.netIncome ?? null)} | Op. Margin ${margin}`
      );
    }
  }

  if (balanceSheets.length > 0) {
    const bs = balanceSheets[0];
    lines.push("\n=== BALANCE SHEET (most recent) ===");
    lines.push(`Total Assets: ${fmtB(bs.totalAssets ?? null)} | Equity: ${fmtB(bs.totalStockholdersEquity ?? null)} | Debt: ${fmtB(bs.totalDebt ?? null)}`);
    if (bs.cashAndCashEquivalents != null) lines.push(`Cash: ${fmtB(bs.cashAndCashEquivalents)}`);
    const dte =
      bs.totalStockholdersEquity && bs.totalStockholdersEquity > 0 && bs.totalDebt != null
        ? (bs.totalDebt / bs.totalStockholdersEquity).toFixed(2)
        : "N/A";
    lines.push(`Debt/Equity: ${dte}`);
  }

  const latestMetric = metricsArr[0] ?? null;
  const latestRatio = ratiosArr[0] ?? null;
  if (latestMetric || latestRatio) {
    lines.push("\n=== VALUATION & QUALITY RATIOS ===");
    const pe = latestMetric?.peRatio ?? latestRatio?.priceEarningsRatio;
    const pb = latestMetric?.priceToBookRatio ?? latestRatio?.priceToBookRatio;
    const roe = latestMetric?.roe ?? latestRatio?.returnOnEquity;
    const ey = latestMetric?.earningsYield;
    const dy = latestMetric?.dividendYield ?? latestRatio?.dividendYield;
    const dte2 = latestMetric?.debtToEquity;

    if (pe != null) lines.push(`P/E: ${fmtNum(pe, 1)}`);
    if (pb != null) lines.push(`P/B: ${fmtNum(pb, 2)}`);
    if (roe != null) lines.push(`ROE: ${fmtPct(roe)}`);
    if (ey != null) lines.push(`Earnings Yield: ${fmtPct(ey)}`);
    if (dy != null) lines.push(`Dividend Yield: ${fmtPct(dy)}`);
    if (dte2 != null) lines.push(`Debt/Equity: ${fmtNum(dte2, 2)}`);
    if (latestRatio?.netProfitMargin != null) lines.push(`Net Profit Margin: ${fmtPct(latestRatio.netProfitMargin)}`);
    if (latestRatio?.operatingProfitMargin != null) lines.push(`Operating Margin: ${fmtPct(latestRatio.operatingProfitMargin)}`);
  }

  return lines.join("\n");
}

// ─── Claude call ──────────────────────────────────────────────────────────────

async function callClaude(
  researchPrompt: string,
  claudeKey: string
): Promise<Omit<ClaudeAnalysis, "aiAdjustedScore">> {
  const systemPrompt = `You are a quantitative research analyst. Your workflow is:
1. READ the provided raw company data carefully and RESEARCH the stock's current state.
2. RECOMMEND which quantitative formula from the approved list best fits this specific company.
3. NEVER calculate any numbers yourself — the quant engine handles all calculations.

You MUST select "selected_formula" from EXACTLY this list (no other values allowed):
  FACTOR MODELS (single or multi-factor):
    "CAPM"         — E[R] = Rf + β·(Rm−Rf). For large-cap, stable, low-idiosyncratic-risk stocks.
    "FF3"          — Fama-French 3-factor: adds SMB (size) + HML (value). For size/value tilts.
    "FF5"          — Fama-French 5-factor: adds RMW (profitability) + CMA (investment). When quality/capex allocation drives returns.
    "APT"          — Arbitrage Pricing Theory (Ross 1976). For sector-driven, rate-sensitive, or macro-exposed stocks.
  COMPOSITE / HYBRID MODELS (from the research paper):
    "SVJ"          — Stochastic Volatility + Jump (Heston + Merton). For volatile stocks with fat tails or jump risk.
    "Factor-Kelly" — Multi-Factor Log-Optimal Kelly. For high-growth, leverage-optimized systematic strategies.
    "GARCH-BS"     — Volatility-Adjusted Black-Scholes (GARCH forecast → BS drift). For options-like or vol-regime-sensitive stocks.
    "Tail-CVaR"    — Tail-Risk-Adjusted Factor Model (APT + CVaR constraint). For leveraged or tail-risk-sensitive stocks.

Research selection guide:
- Large stable blue-chip: CAPM or FF3
- Clear value/size play: FF3 or FF5
- High-quality profitable compounder: FF5
- Macro/sector/rate sensitive: APT
- High vol + jump history (biotech, crypto-adjacent, earnings surprise stocks): SVJ
- Aggressive growth + levered (Kelly-style sizing): Factor-Kelly
- Implied-vol or options-context stock: GARCH-BS
- Distressed, highly leveraged, tail-risk focus: Tail-CVaR

Risk metric selection:
- CVaR: coherent, for tail-risk-sensitive stocks (leveraged, volatile)
- VaR: standard regulatory measure for stable portfolios
- Sharpe: for quality/stable stocks where risk-adjusted return is primary
- GARCH: for regime-switching or recently volatile stocks

You MUST respond with ONLY valid JSON — no markdown fences, no text outside the JSON.
Required JSON structure:
{
  "selected_formula": <one of the 8 formulas listed above>,
  "recommended_formula": "descriptive name, e.g. Quality-Growth FF5",
  "score_weights": {
    "momentum": <0.0–1.0>,
    "value": <0.0–1.0>,
    "quality": <0.0–1.0>,
    "size": <0.0–1.0>,
    "volatility": <0.0–1.0>
  },
  "ff_factor_emphasis": {
    "market": <0.0–1.0>,
    "smb": <0.0–1.0>,
    "hml": <0.0–1.0>,
    "rmw": <0.0–1.0>,
    "cma": <0.0–1.0>
  },
  "risk_metric": "CVaR" | "VaR" | "Sharpe" | "GARCH",
  "research_summary": "3-4 sentences describing the company's current state: recent performance trends, earnings/margin trajectory, leverage posture, and why these factors led to your formula recommendation.",
  "rationale": "1-2 sentence summary of the formula recommendation"
}`;

  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: "user", content: researchPrompt }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": claudeKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const rawBody = await res.text();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any = {};
  if (rawBody.trim()) {
    try { env = JSON.parse(rawBody); } catch { /* not JSON */ }
  }

  if (!res.ok) {
    const msg: string = env?.error?.message ?? `Claude API error (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const text: string = env?.content?.[0]?.text ?? "";
  if (!text.trim()) {
    throw new Error("Claude returned an empty response — check your API key and account status");
  }

  // Strip markdown code fences if present
  let json = text.trim();
  if (json.startsWith("```")) {
    json = json.split("\n").slice(1).join("\n");
    const fence = json.lastIndexOf("```");
    if (fence !== -1) json = json.slice(0, fence);
  }
  json = json.trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(`Claude returned non-JSON text: "${json.slice(0, 200)}"`);
  }

  // Normalise score_weights so they sum to 1
  const sw = raw.score_weights ?? {};
  const swTotal =
    (sw.momentum ?? 0) + (sw.value ?? 0) + (sw.quality ?? 0) +
    (sw.size ?? 0) + (sw.volatility ?? 0) || 1;
  const normSW = (v: number) => (v ?? 0) / swTotal;

  const ffe = raw.ff_factor_emphasis ?? {};

  const validFormulas = [
    "CAPM", "FF3", "FF5", "APT",
    "SVJ", "Factor-Kelly", "GARCH-BS", "Tail-CVaR",
  ] as const;
  const validRiskMetrics = ["CVaR", "VaR", "Sharpe", "GARCH"] as const;

  return {
    selectedFormula: validFormulas.includes(raw.selected_formula) ? raw.selected_formula : "FF5",
    recommendedFormula: raw.recommended_formula ?? "FF5",
    scoreWeights: {
      momentum:   normSW(sw.momentum),
      value:      normSW(sw.value),
      quality:    normSW(sw.quality),
      size:       normSW(sw.size),
      volatility: normSW(sw.volatility),
    },
    ffFactorEmphasis: {
      market: ffe.market ?? 0.5,
      smb:    ffe.smb    ?? 0.3,
      hml:    ffe.hml    ?? 0.3,
      rmw:    ffe.rmw    ?? 0.3,
      cma:    ffe.cma    ?? 0.2,
    },
    riskMetric: validRiskMetrics.includes(raw.risk_metric) ? raw.risk_metric : "CVaR",
    rationale: raw.rationale ?? "",
    researchSummary: raw.research_summary ?? "",
  };
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function sseEvent(controller: ReadableStreamDefaultController, event: ProgressEvent) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ticker: string = (body.ticker ?? "").toUpperCase().trim();
  const polygonKey: string = process.env.POLYGON_API_KEY || body.polygonKey || "";
  const fmpKey: string = process.env.FMP_API_KEY || body.fmpKey || "";
  const claudeKey: string = process.env.ANTHROPIC_API_KEY || body.claudeKey || "";

  if (!ticker) return NextResponse.json({ error: "Ticker required" }, { status: 400 });
  if (!polygonKey) return NextResponse.json({ error: "Polygon API key required" }, { status: 400 });
  if (!fmpKey) return NextResponse.json({ error: "FMP API key required" }, { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => sseEvent(controller, event);

      try {
        // ── Stage 1: Fetch all data ──────────────────────────────────────────
        send({ stage: "fetching", message: "Fetching Stock Data..." });

        const to = dateOffset(0);
        const from730 = dateOffset(730);
        const from2y = dateOffset(750);

        const [stockBars, spyBars, iwmBars, iveBars, ivwBars] = await Promise.all([
          fetchPolygonBars(ticker, from730, to, polygonKey),
          fetchPolygonBars("SPY", from2y, to, polygonKey),
          fetchPolygonBars("IWM", from2y, to, polygonKey).catch(() => null as PricePoint[] | null),
          fetchPolygonBars("IVE", from2y, to, polygonKey).catch(() => null as PricePoint[] | null),
          fetchPolygonBars("IVW", from2y, to, polygonKey).catch(() => null as PricePoint[] | null),
        ]);

        const [profileArr, metricsArr, ratiosArr, incomeArr, balanceArr] = await Promise.all([
          fmpGet<FMPProfile[]>(`/profile/${ticker}`, fmpKey).catch(() => [] as FMPProfile[]),
          fmpGet<FMPKeyMetrics[]>(`/key-metrics/${ticker}?period=annual&limit=5`, fmpKey).catch(() => [] as FMPKeyMetrics[]),
          fmpGet<FMPRatios[]>(`/ratios/${ticker}?period=annual&limit=5`, fmpKey).catch(() => [] as FMPRatios[]),
          fmpGet<FMPIncomeStatement[]>(`/income-statement/${ticker}?period=annual&limit=5`, fmpKey).catch(() => [] as FMPIncomeStatement[]),
          fmpGet<FMPBalanceSheet[]>(`/balance-sheet-statement/${ticker}?period=annual&limit=5`, fmpKey).catch(() => [] as FMPBalanceSheet[]),
        ]);

        const profile: FMPProfile | null = profileArr[0] ?? null;
        const latestMetric: FMPKeyMetrics | null = metricsArr[0] ?? null;
        const latestRatio: FMPRatios | null = ratiosArr[0] ?? null;

        // Compute simple returns for Claude prompt using raw price array
        const sortedBars = [...stockBars].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const latestPrice = sortedBars[sortedBars.length - 1]?.price ?? 0;
        const price3MAgo = sortedBars[Math.max(0, sortedBars.length - 63)]?.price ?? latestPrice;
        const price12MAgo = sortedBars[Math.max(0, sortedBars.length - 252)]?.price ?? latestPrice;
        const return3M = price3MAgo > 0 ? latestPrice / price3MAgo - 1 : 0;
        const return12M = price12MAgo > 0 ? latestPrice / price12MAgo - 1 : 0;

        // ── Stage 2: Claude Researching ──────────────────────────────────────
        let claudeAnalysis: ClaudeAnalysis | undefined;
        let claudeError: string | undefined;

        if (claudeKey) {
          send({ stage: "researching", message: "Claude Researching..." });

          try {
            const researchPrompt = buildClaudeResearchPrompt(
              ticker,
              profile,
              incomeArr,
              balanceArr,
              metricsArr,
              ratiosArr,
              return3M,
              return12M
            );

            const partial = await callClaude(researchPrompt, claudeKey);

            // ── Stage 3: Selecting formula ───────────────────────────────────
            send({ stage: "selecting", message: "Selecting Best Formula..." });

            // Store partial so the calculator can use it
            claudeAnalysis = { ...partial, aiAdjustedScore: 0 }; // score filled in after calc
          } catch (err) {
            claudeError = err instanceof Error ? err.message : "Claude analysis failed";
            console.error("[Claude]", claudeError);
          }
        }

        // ── Stage 4: Calculating ─────────────────────────────────────────────
        send({ stage: "calculating", message: "Calculating..." });

        const stockReturns: DailyReturn[] = computeReturnsFromPrices(stockBars);
        const marketReturns: DailyReturn[] = computeReturnsFromPrices(spyBars);

        // SMB proxy: IWM - SPY
        let smbReturns: DailyReturn[] | null = null;
        if (iwmBars) {
          const iwmRets = computeReturnsFromPrices(iwmBars);
          const spyMap: Record<string, number> = {};
          for (const r of marketReturns) spyMap[r.date] = r.returnValue;
          smbReturns = iwmRets
            .filter((r) => r.date in spyMap)
            .map((r) => ({ date: r.date, returnValue: r.returnValue - spyMap[r.date] }));
        }

        // HML proxy: IVE - IVW
        let hmlReturns: DailyReturn[] | null = null;
        if (iveBars && ivwBars) {
          const iveRets = computeReturnsFromPrices(iveBars);
          const ivwMap: Record<string, number> = {};
          for (const r of computeReturnsFromPrices(ivwBars)) ivwMap[r.date] = r.returnValue;
          hmlReturns = iveRets
            .filter((r) => r.date in ivwMap)
            .map((r) => ({ date: r.date, returnValue: r.returnValue - ivwMap[r.date] }));
        }

        const pbRaw = latestMetric?.priceToBookRatio ?? latestRatio?.priceToBookRatio;
        const bookToMarket = pbRaw && pbRaw > 0 ? 1 / pbRaw : undefined;

        let valueSignal = "N/A";
        if (bookToMarket !== undefined) {
          if (bookToMarket > 0.8) valueSignal = "Deep Value";
          else if (bookToMarket > 0.4) valueSignal = "Value";
          else if (bookToMarket > 0.2) valueSignal = "Blend";
          else valueSignal = "Growth";
        }

        const valueMetrics: ValueMetrics = {
          bookToMarket,
          peRatio: latestMetric?.peRatio ?? latestRatio?.priceEarningsRatio,
          pbRatio: pbRaw,
          roe: latestMetric?.roe ?? latestRatio?.returnOnEquity,
          debtToEquity: latestMetric?.debtToEquity,
          earningsYield: latestMetric?.earningsYield,
          dividendYield: latestMetric?.dividendYield ?? latestRatio?.dividendYield,
          valueSignal,
        };

        const famaFrench = computeFamaFrenchFiveFactor(
          stockReturns,
          marketReturns,
          smbReturns,
          hmlReturns,
          valueMetrics,
          incomeArr,
          balanceArr,
          ticker
        );
        const momentum = computeMomentum(stockBars);
        const volatility = computeVolatility(stockBars);
        const riskMetrics = computeRiskMetrics(stockBars);

        // Base quant score with default 30/25/20/15/10 weights
        const quantScore = computeQuantScore({ momentum, valueMetrics, famaFrench, volatility });

        // Kelly Criterion
        const kelly = (() => {
          if (!famaFrench || !volatility) return undefined;
          const expectedReturn = famaFrench.expectedExcessReturn + ANNUAL_RISK_FREE_RATE;
          const annualVol = volatility.annualizedVolatility;
          return computeKelly(expectedReturn, annualVol * annualVol);
        })();

        // Price prediction (GBM using FF5 drift + GARCH vol)
        const pricePrediction = computePricePrediction(
          stockBars,
          famaFrench,
          volatility,
          riskMetrics
        ) ?? undefined;

        // Recalculate score with Claude's recommended weights (engine does all calculations)
        if (claudeAnalysis) {
          const aiAdjustedScore = computeQuantScore(
            { momentum, valueMetrics, famaFrench, volatility },
            claudeAnalysis.scoreWeights
          );
          claudeAnalysis = { ...claudeAnalysis, aiAdjustedScore };
        }

        // ── Stage 5: Generating Report ───────────────────────────────────────
        send({ stage: "reporting", message: "Generating Report..." });

        const analysis: QuantAnalysis = {
          id: crypto.randomUUID(),
          ticker,
          profile: profile ?? undefined,
          analyzedAt: new Date().toISOString(),
          famaFrench: famaFrench ?? undefined,
          momentum: momentum ?? undefined,
          volatility: volatility ?? undefined,
          valueMetrics,
          riskMetrics: riskMetrics ?? undefined,
          kelly,
          priceHistory: stockBars,
          pricePrediction,
          claudeAnalysis,
          claudeError,
          quantScore,
          quantScoreLabel: quantScoreLabel(quantScore),
        };

        // ── Stage 6: Complete ────────────────────────────────────────────────
        send({ stage: "complete", message: "Done", result: analysis });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Analysis failed";
        send({ stage: "error", message: msg, error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
