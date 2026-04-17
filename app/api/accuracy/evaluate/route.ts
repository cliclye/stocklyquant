import { NextRequest, NextResponse } from "next/server";
import { fetchPolygonBars } from "@/lib/analyzeStock";
import type { LocalAccuracyEvaluation } from "@/lib/localAccuracy";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface EvaluateItem {
  id: string;
  ticker: string;
  predictionDate: string;
  startPrice: number;
  predictedPrice30d: number;
  predictedUpper95: number | null;
  predictedLower95: number | null;
  predictedDirection: "UP" | "DOWN";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const polygonKey: string = process.env.POLYGON_API_KEY || body.polygonKey || "";
  const items = body.items as EvaluateItem[] | undefined;

  if (!polygonKey) {
    return NextResponse.json({ error: "Polygon API key required" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }
  if (items.length > 25) {
    return NextResponse.json({ error: "Too many items (max 25)" }, { status: 400 });
  }

  const results: { id: string; evaluation: LocalAccuracyEvaluation }[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const pred of items) {
    if (!pred.id || !pred.ticker || !pred.predictionDate) {
      errors.push({ id: pred?.id ?? "unknown", error: "Missing id, ticker, or predictionDate" });
      continue;
    }

    const evaluationDate = addDays(pred.predictionDate, 30);
    const windowFrom = addDays(evaluationDate, -5);
    const windowTo = addDays(evaluationDate, 5);

    let actualPrice: number | null = null;

    try {
      const bars = await fetchPolygonBars(pred.ticker, windowFrom, windowTo, polygonKey);
      if (!bars.length) throw new Error("No price data in evaluation window");

      const target = new Date(evaluationDate).getTime();
      bars.sort(
        (a, b) =>
          Math.abs(new Date(a.date).getTime() - target) -
          Math.abs(new Date(b.date).getTime() - target)
      );
      actualPrice = bars[0].price;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Price fetch failed";
      console.error("[api/accuracy/evaluate]", pred.ticker, msg);
      errors.push({ id: pred.id, error: msg });
      continue;
    }

    const startPrice = Number(pred.startPrice);
    const predictedPrice = Number(pred.predictedPrice30d);
    const upper95 = pred.predictedUpper95 != null ? Number(pred.predictedUpper95) : null;
    const lower95 = pred.predictedLower95 != null ? Number(pred.predictedLower95) : null;

    if (!startPrice || !actualPrice) {
      errors.push({ id: pred.id, error: "Invalid price data (zero or missing)" });
      continue;
    }

    const predictedReturn = (predictedPrice - startPrice) / startPrice;
    const actualReturn = (actualPrice - startPrice) / startPrice;

    const inCi95 =
      upper95 != null && lower95 != null ? actualPrice >= lower95 && actualPrice <= upper95 : null;

    const directionCorrect =
      (actualReturn > 0 && pred.predictedDirection === "UP") ||
      (actualReturn < 0 && pred.predictedDirection === "DOWN") ||
      actualReturn === 0;

    const predictionErrorPct = (Math.abs(predictedPrice - actualPrice) / actualPrice) * 100;

    const evaluation: LocalAccuracyEvaluation = {
      evaluationDate,
      actualPrice,
      predictedReturn,
      actualReturn,
      inCi95,
      directionCorrect,
      predictionErrorPct,
    };

    results.push({ id: pred.id, evaluation });
  }

  return NextResponse.json({ results, errors });
}
