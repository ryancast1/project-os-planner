import { createRequestCache } from "./requestCache";
import type { PolymarketQuote } from "./types";

export function createQuoteBatcher(
  load: (tokens: string[]) => Promise<Record<string, PolymarketQuote | null>>,
  { delayMs = 32, ttlMs = 4000, now = Date.now } = {},
) {
  const cache = createRequestCache<PolymarketQuote | null>(512, now);
  let queued = new Map<string, (quote: PolymarketQuote | null) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function flush() {
    timer = undefined;
    const batch = queued;
    queued = new Map();
    const tokens = [...batch.keys()];
    for (let start = 0; start < tokens.length; start += 500) {
      const chunk = tokens.slice(start, start + 500);
      let quotes: Record<string, PolymarketQuote | null> = {};
      try { quotes = await load(chunk); } catch { /* Retain prior genuine prices on failure. */ }
      for (const token of chunk) batch.get(token)?.(quotes[token] ?? null);
    }
  }
  return (token: string) => cache.get(token, ttlMs, () => new Promise((resolve) => {
    queued.set(token, resolve);
    timer ??= setTimeout(() => { void flush(); }, delayMs);
  }), (quote) => quote !== null);
}
