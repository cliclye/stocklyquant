import { NextRequest, NextResponse } from "next/server";
import type { PricePoint } from "@/lib/types";

const INDICES = ["SPY", "QQQ", "DIA", "IWM", "VXX"];

async function fetchLatestBar(
  ticker: string,
  apiKey: string
): Promise<{ ticker: string; price: number; change: number; changePct: number }> {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=10&apiKey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 300 } }); // 5-min cache
  if (res.status === 403) throw new Error(`Invalid Polygon API key`);
  if (res.status === 429) throw new Error(`Polygon rate limited`);
  if (!res.ok) throw new Error(`Polygon API error for ${ticker} (HTTP ${res.status})`);
  const data = await res.json();
  const results: PricePoint[] = (data.results ?? []).map(
    (b: { t: number; c: number; v: number; o: number; h: number; l: number }) => ({
      date: new Date(b.t).toISOString().slice(0, 10),
      price: b.c,
      volume: b.v,
    })
  );
  if (results.length < 2) throw new Error(`Insufficient price data for ${ticker}`);
  const latest = results[results.length - 1];
  const prev = results[results.length - 2];
  const change = latest.price - prev.price;
  const changePct = prev.price > 0 ? (change / prev.price) * 100 : 0;
  return { ticker, price: latest.price, change, changePct };
}

export async function GET(req: NextRequest) {
  const userKey = req.nextUrl.searchParams.get("key");
  const apiKey = process.env.POLYGON_API_KEY || userKey;

  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  const settled = await Promise.allSettled(INDICES.map((t) => fetchLatestBar(t, apiKey)));
  const indices: { ticker: string; price: number; change: number; changePct: number }[] = [];
  const errors: string[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      indices.push(result.value);
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(msg);
      console.error("[market]", msg);
    }
  }

  if (indices.length === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: `Failed to load market data: ${errors[0]}`, errors },
      { status: 502 }
    );
  }

  return NextResponse.json({ indices, ...(errors.length > 0 ? { errors } : {}) });
}
