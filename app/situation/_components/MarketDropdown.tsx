"use client";

import type { SavedMarket } from "../_lib/types";
import { BUILTIN_MARKETS, BUILTIN_CATEGORIES } from "../_lib/constants";

export default function MarketDropdown({
  savedMarkets,
  selectedId,
  onSelect,
}: {
  savedMarkets: SavedMarket[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <select
      value={selectedId ?? ""}
      onChange={(e) => onSelect(e.target.value || null)}
      className="w-full rounded-lg border border-white/10 bg-white/5 text-white text-xs px-2 py-1.5 outline-none focus:border-white/20 truncate"
    >
      <option value="" className="bg-zinc-900">
        Select a market...
      </option>

      {/* Built-in markets grouped by category */}
      {BUILTIN_CATEGORIES.map((cat) => (
        <optgroup key={cat} label={cat} className="bg-zinc-900 text-white/60">
          {BUILTIN_MARKETS.filter((m) => m.category === cat).map((m) => (
            <option key={m.id} value={m.id} className="bg-zinc-900 text-white">
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}

      {/* User's saved Polymarket markets */}
      {savedMarkets.length > 0 && (
        <optgroup label="Your Markets" className="bg-zinc-900 text-white/60">
          {savedMarkets.map((m) => (
            <option key={m.id} value={m.id} className="bg-zinc-900 text-white">
              {m.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
