import { NextRequest, NextResponse } from "next/server";
import { getPolymarketQuote } from "../_lib/polymarket";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CLOB_API = "https://clob.polymarket.com";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  let url: string;

  switch (endpoint) {
    case "event": {
      const slug = searchParams.get("slug") ?? "";
      url = `${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`;
      break;
    }
    case "price": {
      const tokenId = searchParams.get("token_id") ?? "";
      url = `${CLOB_API}/book?token_id=${encodeURIComponent(tokenId)}`;
      break;
    }
    case "history": {
      const market = searchParams.get("market") ?? "";
      const fidelity = searchParams.get("fidelity") ?? "1";
      const startTs = searchParams.get("startTs");
      const interval = searchParams.get("interval");
      if (interval) {
        url = `${CLOB_API}/prices-history?market=${encodeURIComponent(market)}&interval=${encodeURIComponent(interval)}&fidelity=${fidelity}`;
      } else {
        const endTs = searchParams.get("endTs") ?? "";
        url = `${CLOB_API}/prices-history?market=${encodeURIComponent(market)}&startTs=${startTs}&endTs=${endTs}&fidelity=${fidelity}`;
      }
      break;
    }
    case "stock": {
      const ticker = searchParams.get("ticker") ?? "";
      const yahooRange = searchParams.get("range") ?? "1d";
      const yahooInterval = searchParams.get("interval") ?? "5m";
      const prepost = searchParams.get("prepost") === "true";
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yahooInterval}&range=${yahooRange}&includePrePost=${prepost}`;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown endpoint" }, { status: 400 });
  }

  try {
    const res = await fetch(url, endpoint === "price" ? { cache: "no-store" } : undefined);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    if (endpoint === "price") {
      let quote = getPolymarketQuote(data);
      if (!quote) {
        const tokenId = searchParams.get("token_id") ?? "";
        const lastTrade = await fetch(`${CLOB_API}/last-trade-price?token_id=${encodeURIComponent(tokenId)}`, { cache: "no-store" });
        if (lastTrade.ok) quote = getPolymarketQuote(data, (await lastTrade.json()).price);
      }
      return NextResponse.json({ price: quote?.price ?? null, normalizationSafe: quote?.normalizationSafe ?? false });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch from Polymarket" },
      { status: 502 }
    );
  }
}
