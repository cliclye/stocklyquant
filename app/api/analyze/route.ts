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
} from "@/lib/types";
import {
  computeFamaFrenchFiveFactor,
  computeMomentum,
  computeVolatility,
  computeQuantScore,
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

// ─── Claude call ──────────────────────────────────────────────────────────────

async function callClaude(
  prompt: string,
  claudeKey: string
): Promise<ClaudeAnalysis> {
  const systemPrompt = `You are a quantitative finance expert. Analyze the provided stock metrics and determine:
1. Which Fama-French factors are most important for THIS specific stock
2. The optimal multi-factor score weights for this stock's characteristics
3. A predicted annual return with confidence level
4. Key insights and risks

You MUST respond with ONLY valid JSON — no markdown, no explanation outside the JSON.
Required JSON structure:
{
  "factor_importance": { "market": 0.0-1.0, "smb": 0.0-1.0, "hml": 0.0-1.0, "rmw": 0.0-1.0, "cma": 0.0-1.0 },
  "score_weights": { "momentum": 0.0-1.0, "value": 0.0-1.0, "quality": 0.0-1.0, "size": 0.0-1.0, "volatility": 0.0-1.0 },
  "prediction": {
    "expected_annual_return_pct": number,
    "confidence": "low|medium|high",
    "investment_horizon": "short|medium|long",
    "rating": "strong_buy|buy|neutral|sell|strong_sell"
  },
  "insights": ["insight1", "insight2", "insight3"],
  "key_risks": ["risk1", "risk2"],
  "formula_note": "why you chose these weights",
  "adjusted_quant_score": 0-100
}`;

  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
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

  // Read as text first — res.json() itself throws on empty bodies
  const rawBody = await res.text();

  // Try to parse the body as JSON (may fail for HTML error pages, empty bodies, etc.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any = {};
  if (rawBody.trim()) {
    try { env = JSON.parse(rawBody); } catch { /* body wasn't JSON, env stays {} */ }
  }

  if (!res.ok) {
    // Anthropic error envelope: { error: { message: "...", type: "..." } }
    const msg: string =
      env?.error?.message ?? `Claude API error (HTTP ${res.status})`;
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
  const sw = raw.score_weights;
  const total = sw.momentum + sw.value + sw.quality + sw.size + sw.volatility || 1;
  const norm = (v: number) => v / total;

  return {
    factorImportance: {
      market: raw.factor_importance.market,
      smb: raw.factor_importance.smb,
      hml: raw.factor_importance.hml,
      rmw: raw.factor_importance.rmw,
      cma: raw.factor_importance.cma,
    },
    scoreWeights: {
      momentum: norm(sw.momentum),
      value: norm(sw.value),
      quality: norm(sw.quality),
      size: norm(sw.size),
      volatility: norm(sw.volatility),
    },
    prediction: {
      expectedAnnualReturnPct: raw.prediction.expected_annual_return_pct,
      confidence: raw.prediction.confidence,
      investmentHorizon: raw.prediction.investment_horizon,
      rating: raw.prediction.rating,
    },
    insights: raw.insights ?? [],
    keyRisks: raw.key_risks ?? [],
    formulaNote: raw.formula_note ?? "",
    adjustedQuantScore: Math.min(Math.max(raw.adjusted_quant_score, 0), 100),
  };
}

// ─── Build Claude prompt ──────────────────────────────────────────────────────

function buildClaudePrompt(
  ticker: string,
  profile: FMPProfile | null,
  ff: ReturnType<typeof computeFamaFrenchFiveFactor>,
  mom: ReturnType<typeof computeMomentum>,
  vol: ReturnType<typeof computeVolatility>,
  val: ValueMetrics | null,
  baseScore: number
): string {
  const lines: string[] = [];
  lines.push(`Stock: ${ticker}`);
  if (profile) {
    lines.push(`Company: ${profile.companyName}`);
    lines.push(`Sector: ${profile.sector ?? "Unknown"}`);
    lines.push(`Industry: ${profile.industry ?? "Unknown"}`);
  }
  lines.push("\n--- Fama-French Five-Factor Betas ---");
  if (ff) {
    lines.push(`Market β: ${ff.betas.marketBeta.toFixed(3)}`);
    lines.push(`SMB β: ${ff.betas.smbBeta.toFixed(3)}`);
    lines.push(`HML β: ${ff.betas.hmlBeta.toFixed(3)}`);
    lines.push(`RMW β: ${ff.rmwBeta.toFixed(3)}`);
    lines.push(`CMA β: ${ff.cmaBeta.toFixed(3)}`);
    lines.push(`Alpha (ann.): ${(ff.betas.alpha * 100).toFixed(3)}%`);
    lines.push(`R²: ${ff.betas.rSquared.toFixed(3)}`);
    lines.push(`FF5 Expected Annual Return: ${((ff.expectedExcessReturn + ANNUAL_RISK_FREE_RATE) * 100).toFixed(2)}%`);
  }
  lines.push("\n--- Momentum ---");
  if (mom) {
    lines.push(`12M: ${((mom.momentum12M - 1) * 100).toFixed(1)}% (${mom.signal})`);
    lines.push(`6M: ${((mom.momentum6M - 1) * 100).toFixed(1)}%`);
    lines.push(`3M: ${((mom.momentum3M - 1) * 100).toFixed(1)}%`);
    lines.push(`1M: ${((mom.momentum1M - 1) * 100).toFixed(1)}%`);
  }
  lines.push("\n--- Risk / Volatility ---");
  if (vol) {
    lines.push(`Annualised Vol: ${(vol.annualizedVolatility * 100).toFixed(1)}% (${vol.riskLevel})`);
    lines.push(`30D Vol: ${(vol.volatility30D * 100).toFixed(1)}%`);
    lines.push(`Sharpe Ratio: ${vol.sharpeRatio.toFixed(2)}`);
  }
  lines.push("\n--- Value / Fundamentals ---");
  if (val) {
    if (val.bookToMarket !== undefined) lines.push(`Book-to-Market: ${val.bookToMarket.toFixed(3)} (${val.valueSignal})`);
    if (val.peRatio !== undefined) lines.push(`P/E: ${val.peRatio.toFixed(1)}`);
    if (val.pbRatio !== undefined) lines.push(`P/B: ${val.pbRatio.toFixed(2)}`);
    if (val.roe !== undefined) lines.push(`ROE: ${(val.roe * 100).toFixed(1)}%`);
  }
  lines.push(`\nBase Quant Score: ${baseScore.toFixed(1)}/100`);
  return lines.join("\n");
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

  try {
    const to = dateOffset(0);
    const from730 = dateOffset(730);
    const from2y = dateOffset(750);

    // Fetch all price data in parallel
    const [stockBars, spyBars, iwmBars, iveBars, ivwBars] = await Promise.all([
      fetchPolygonBars(ticker, from730, to, polygonKey),
      fetchPolygonBars("SPY", from2y, to, polygonKey),
      fetchPolygonBars("IWM", from2y, to, polygonKey).catch(() => null as PricePoint[] | null),
      fetchPolygonBars("IVE", from2y, to, polygonKey).catch(() => null as PricePoint[] | null),
      fetchPolygonBars("IVW", from2y, to, polygonKey).catch(() => null as PricePoint[] | null),
    ]);

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

    // FMP data in parallel
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

    // Quant calculations
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
    const quantScore = computeQuantScore({ momentum, valueMetrics, famaFrench, volatility });

    // Claude analysis (optional)
    let claudeAnalysis: ClaudeAnalysis | undefined;
    let claudeError: string | undefined;
    if (claudeKey) {
      try {
        const prompt = buildClaudePrompt(ticker, profile, famaFrench, momentum, volatility, valueMetrics, quantScore);
        claudeAnalysis = await callClaude(prompt, claudeKey);
      } catch (err) {
        claudeError = err instanceof Error ? err.message : "Claude analysis failed";
        console.error("[Claude]", claudeError);
      }
    }

    const analysis: QuantAnalysis = {
      id: crypto.randomUUID(),
      ticker,
      profile: profile ?? undefined,
      analyzedAt: new Date().toISOString(),
      famaFrench: famaFrench ?? undefined,
      momentum: momentum ?? undefined,
      volatility: volatility ?? undefined,
      valueMetrics,
      priceHistory: stockBars,
      claudeAnalysis,
      claudeError,
      quantScore,
      quantScoreLabel: quantScoreLabel(quantScore),
    };

    return NextResponse.json(analysis);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
