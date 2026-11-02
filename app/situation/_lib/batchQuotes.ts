import { getPolymarketQuote } from "./polymarket";
import type { PolymarketQuote } from "./types";

const CLOB_API = "https://clob.polymarket.com";
type Book = Parameters<typeof getPolymarketQuote>[0] & { asset_id?: string };

export function parseBatchTokenIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object" || !("tokenIds" in body) || !Array.isArray(body.tokenIds)) return null;
  if (!body.tokenIds.length || body.tokenIds.length > 500 || body.tokenIds.some((token) => typeof token !== "string" || !/^[\w-]{1,128}$/.test(token))) return null;
  return [...new Set(body.tokenIds)] as string[];
}

export async function loadBatchQuotes(tokens: string[], request: typeof fetch = fetch): Promise<Record<string, PolymarketQuote | null>> {
  const books = new Map<string, Book>();
  const quotes: Record<string, PolymarketQuote | null> = Object.fromEntries(tokens.map((token) => [token, null]));
  async function post(path: string, ids: string[]) {
    return request(`${CLOB_API}/${path}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids.map((token_id) => ({ token_id }))),
    });
  }
  let bookBudget = 15;
  async function readBooks(ids: string[]): Promise<void> {
    if (bookBudget-- <= 0) return;
    try {
      const response = await post("books", ids);
      if (!response.ok) {
        // One closed/invalid token must not prevent healthy markets updating.
        // Bound retries so an unavailable batch cannot create a request storm.
        if ((response.status === 400 || response.status === 404) && ids.length > 1 && bookBudget > 0) {
          const middle = Math.ceil(ids.length / 2);
          await Promise.all([readBooks(ids.slice(0, middle)), readBooks(ids.slice(middle))]);
        }
        return;
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) return;
      for (const book of data) {
        if (book && typeof book.asset_id === "string" && ids.includes(book.asset_id)) books.set(book.asset_id, book);
      }
    } catch { /* Token-specific last trades remain a safe fallback. */ }
  }
  await readBooks(tokens);
  for (const token of tokens) quotes[token] = getPolymarketQuote(books.get(token) ?? {});
  const missing = tokens.filter((token) => !quotes[token]);
  if (missing.length) {
    try {
      const response = await post("last-trades-prices", missing);
      if (response.ok) {
        const trades: unknown = await response.json();
        if (Array.isArray(trades)) for (const trade of trades) {
          if (trade && typeof trade.token_id === "string" && missing.includes(trade.token_id)) {
            quotes[trade.token_id] = getPolymarketQuote(books.get(trade.token_id) ?? {}, trade.price);
          }
        }
      }
    } catch { /* Missing quotes stay unavailable, never fabricated. */ }
  }
  return quotes;
}
