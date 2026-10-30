"use client";

import { useEffect, useState } from "react";
import type { MarketInfo, OutcomeColors, SavedMarket } from "../_lib/types";
import { fetchEvent } from "../_lib/api";
import { getOutcomeColor, isOutcomeColor, OUTCOME_COLOR_OPTIONS, sanitizeOutcomeColors } from "../_lib/colors";
import { saveMarketOutcomeColors } from "../_lib/markets";

export default function OutcomeColorsEditor({ market, userId, onColorsSaved }: {
  market: SavedMarket;
  userId: string;
  onColorsSaved: (marketId: string, colors: OutcomeColors) => void;
}) {
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState(() => sanitizeOutcomeColors(market.outcome_colors));
  const [saved, setSaved] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEvent(market.slug).then((result) => {
      if (cancelled) return;
      setInfo(result);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [market.slug, attempt]);

  const dirty = Object.keys({ ...saved, ...draft }).some((token) => saved[token] !== draft[token]);

  function changeColor(token: string, value: string) {
    const next = { ...draft };
    if (isOutcomeColor(value)) next[token] = value;
    else delete next[token];
    setDraft(next);
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveMarketOutcomeColors(userId, market.id, draft);
      if (!result) {
        setMessage("Could not save colors. Please try again.");
        return;
      }
      setSaved(draft);
      onColorsSaved(market.id, draft);
      setMessage(result === "synced"
        ? "Colors saved across your devices."
        : "Colors saved in this browser. Cross-device sync is not available yet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3" aria-label={`Outcome colors for ${market.label}`}>
      <p className="mb-3 text-xs leading-relaxed text-white/50">
        Default uses blue for Democrat/(D) and red for Republican/(R). Markets with multiple choices for the same party keep the regular palette. Manual colors always take priority.
      </p>
      {loading ? (
        <p role="status" className="py-2 text-sm text-white/50">Loading outcomes...</p>
      ) : !info ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/50">Could not load this market&apos;s outcomes.</p>
          <button
            onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}
            className="shrink-0 text-sm text-white/80 underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {info.outcomes.map((outcome, i) => (
              <label key={outcome.tokenId} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: getOutcomeColor(outcome, i, draft, info.outcomeNames ?? info.outcomes.map((choice) => choice.name)) }}
                />
                <span className="min-w-0 flex-1 break-words text-sm text-white/80">{outcome.name}</span>
                <select
                  aria-label={`Color for ${outcome.name}`}
                  value={draft[outcome.tokenId] ?? ""}
                  disabled={saving}
                  onChange={(event) => changeColor(outcome.tokenId, event.target.value)}
                  className="w-44 max-w-[55%] shrink-0 rounded-lg border border-white/15 bg-zinc-900 px-2 py-2 text-base text-white outline-none focus:border-white/40 disabled:opacity-50 md:text-sm"
                >
                  <option value="">Default</option>
                  {OUTCOME_COLOR_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {info.kind === "binary" && <p className="mt-2 text-xs text-white/40">Yes/No cards chart the Yes outcome.</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              disabled={saving || Object.keys(draft).length === 0}
              onClick={() => { setDraft({}); setMessage(null); }}
              className="text-xs text-white/50 hover:text-white/80 disabled:opacity-40"
            >
              Reset to defaults
            </button>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save colors"}
            </button>
          </div>
          {message && <p role="status" className="mt-2 text-xs leading-relaxed text-white/60">{message}</p>}
        </>
      )}
    </div>
  );
}
