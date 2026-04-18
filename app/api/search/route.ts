import { NextRequest, NextResponse } from "next/server";
import type { StockSearchResult } from "@/lib/types";
import { pickApiKey } from "@/lib/pickApiKey";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const userKey = req.nextUrl.searchParams.get("key");
  const apiKey = pickApiKey(process.env.POLYGON_API_KEY, userKey);

  if (!q || !apiKey) {
    return NextResponse.json({ error: "Missing query or API key" }, { status: 400 });
  }

  if (q.length > 50) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  try {
    const encoded = encodeURIComponent(q);
    const url = `https://api.polygon.io/v3/reference/tickers?search=${encoded}&active=true&market=stocks&limit=20&apiKey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      results?: { ticker: string; name: string; primary_exchange?: string }[];
      error?: string;
      message?: string;
      status?: string;
    };

    if (res.status === 403) {
      return NextResponse.json(
        { error: data.error || data.message || "Invalid Polygon API key" },
        { status: 403 }
      );
    }

    if (!res.ok) {
      const msg =
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : `Polygon ticker search failed (HTTP ${res.status})`;
      console.error("[api/search] Polygon error:", res.status, data);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    if (data.status === "ERROR") {
      const msg = typeof data.error === "string" ? data.error : "Polygon returned an error for this search.";
      console.error("[api/search] Polygon status ERROR:", data);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const results: StockSearchResult[] = (data.results ?? []).map(
      (r: { ticker: string; name: string; primary_exchange?: string }) => ({
        ticker: r.ticker,
        name: r.name,
        exchange: r.primary_exchange ?? "",
      })
    );
    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    console.error("[api/search]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
