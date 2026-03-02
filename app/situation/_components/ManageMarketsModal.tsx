"use client";

import { useState } from "react";
import type { SavedMarket } from "../_lib/types";
import { extractSlug, fetchEvent } from "../_lib/api";
import { addSavedMarket, removeSavedMarket } from "../_lib/markets";

export default function ManageMarketsModal({
  open,
  onClose,
  savedMarkets,
  userId,
  onMarketsChange,
}: {
  open: boolean;
  onClose: () => void;
  savedMarkets: SavedMarket[];
  userId: string;
  onMarketsChange: () => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="relative bg-zinc-950 rounded-2xl border border-white/10 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Manage Markets</h2>
          <button
            onClick={onClose}
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
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="Label (optional — auto-fetched if blank)"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
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
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">
                      {m.label}
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      {m.slug}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-red-400/70 hover:text-red-400 text-xs shrink-0 transition"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
