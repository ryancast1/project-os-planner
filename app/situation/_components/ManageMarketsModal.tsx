"use client";

import { useState } from "react";
import type { OutcomeColors, SavedMarket } from "../_lib/types";
import { extractSlug, fetchEvent } from "../_lib/api";
import { addSavedMarket, removeSavedMarket } from "../_lib/markets";
import OutcomeColorsEditor from "./OutcomeColorsEditor";

export default function ManageMarketsModal({
  open,
  onClose,
  savedMarkets,
  userId,
  onMarketsChange,
  onMarketColorsChange,
}: {
  open: boolean;
  onClose: () => void;
  savedMarkets: SavedMarket[];
  userId: string;
  onMarketsChange: () => void;
  onMarketColorsChange: (marketId: string, colors: OutcomeColors) => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorsMarketId, setColorsMarketId] = useState<string | null>(null);

  if (!open) return null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const slug = extractSlug(urlInput);
    if (!slug) {
      setError("Paste a valid Polymarket URL");
      return;
    }

    setAdding(true);

    // If no label provided, try to fetch the event title
    let label = labelInput.trim();
    if (!label) {
      const info = await fetchEvent(slug);
      label = info?.title ?? slug;
    }

    const result = await addSavedMarket(userId, label, slug);
    setAdding(false);

    if (!result) {
      setError("Failed to save market");
      return;
    }

    setUrlInput("");
    setLabelInput("");
    onMarketsChange();
  }

  async function handleRemove(id: string) {
    const ok = await removeSavedMarket(id);
    if (ok) onMarketsChange();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Content */}
      <div role="dialog" aria-modal="true" aria-labelledby="manage-markets-title" className="relative bg-zinc-950 rounded-2xl border border-white/10 w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 id="manage-markets-title" className="text-lg font-semibold text-white">Manage Markets</h2>
          <button
            onClick={onClose}
            aria-label="Close Manage Markets"
            className="text-white/50 hover:text-white/80 transition text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Add form */}
        <form onSubmit={handleAdd} className="px-5 py-4 border-b border-white/10 space-y-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Polymarket event URL..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="Label (optional — auto-fetched if blank)"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
          <button
            type="submit"
            disabled={adding || !urlInput.trim()}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 transition disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add Market"}
          </button>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>

        {/* Market list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {savedMarkets.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">
              No saved markets yet
            </p>
          ) : (
            <ul className="space-y-2">
              {savedMarkets.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg bg-white/5 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{m.label}</div>
                      <div className="text-[10px] text-white/40 truncate">{m.slug}</div>
                    </div>
                    <button
                      onClick={() => setColorsMarketId((current) => current === m.id ? null : m.id)}
                      aria-expanded={colorsMarketId === m.id}
                      aria-label={`Colors for ${m.label}`}
                      className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                    >
                      {colorsMarketId === m.id ? "Done" : "Colors"}
                    </button>
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="text-red-400/70 hover:text-red-400 text-xs shrink-0 transition"
                    >
                      Remove
                    </button>
                  </div>
                  {colorsMarketId === m.id && (
                    <OutcomeColorsEditor
                      key={m.id}
                      market={m}
                      userId={userId}
                      onColorsSaved={onMarketColorsChange}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
