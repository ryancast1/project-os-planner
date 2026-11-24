"use client";

import type { SavedMarket } from "../_lib/types";
import { BUILTIN_MARKETS, BUILTIN_CATEGORIES } from "../_lib/constants";

export default function MarketDropdown({
  savedMarkets,
  selectedId,
  onSelect,
  className = "",
  title,
}: {
  savedMarkets: SavedMarket[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
  title?: string;
}) {
  const stocks = savedMarkets.filter((market) => market.source === "stock");
  const markets = savedMarkets.filter((market) => market.source !== "stock");
  return (
    <select
      aria-label="Select a market"
      title={title}
      value={selectedId ?? ""}
      onChange={(e) => onSelect(e.target.value || null)}
      className={`w-full rounded-lg border border-white/10 bg-white/5 text-white text-xs px-2 py-1.5 outline-none focus:border-white/20 truncate ${className}`}
    >
      <option value="" className="bg-zinc-900">
        Select a market...
      </option>

      {/* Saved stocks share the built-in Stocks category; their IDs stay unchanged. */}
      {BUILTIN_CATEGORIES.map((cat) => (
        <optgroup key={cat} label={cat} className="bg-zinc-900 text-white/60">
          {BUILTIN_MARKETS.filter((m) => m.category === cat).map((m) => (
            <option key={m.id} value={m.id} className="bg-zinc-900 text-white">
              {m.label}
            </option>
          ))}
          {cat === "Stocks" && stocks.map((stock) => (
            <option key={stock.id} value={stock.id} className="bg-zinc-900 text-white">
              {stock.label}
            </option>
          ))}
        </optgroup>
      ))}

      {markets.length > 0 && (
        <optgroup label="Your Markets" className="bg-zinc-900 text-white/60">
          {markets.map((m) => (
            <option key={m.id} value={m.id} className="bg-zinc-900 text-white">
              {m.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
