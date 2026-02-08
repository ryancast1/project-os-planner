import { NextRequest, NextResponse } from "next/server";

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
      url = `${CLOB_API}/price?token_id=${encodeURIComponent(tokenId)}&side=buy`;
      break;
    }
    case "history": {
      const market = searchParams.get("market") ?? "";
      const startTs = searchParams.get("startTs") ?? "";
      const endTs = searchParams.get("endTs") ?? "";
      const fidelity = searchParams.get("fidelity") ?? "1";
      url = `${CLOB_API}/prices-history?market=${encodeURIComponent(market)}&startTs=${startTs}&endTs=${endTs}&fidelity=${fidelity}`;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown endpoint" }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch from Polymarket" },
      { status: 502 }
    );
  }
}
