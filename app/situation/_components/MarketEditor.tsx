"use client";

import { useEffect, useState } from "react";
import type { MarketInfo, MarketUpdates, SavedMarket } from "../_lib/types";
import { fetchEvent } from "../_lib/api";
import { getOutcomeColor, isOutcomeColor, OUTCOME_COLOR_OPTIONS, sanitizeOutcomeColors } from "../_lib/colors";
import { saveMarketLabel, saveMarketOutcomeColors } from "../_lib/markets";
import { resolveMarketLabel } from "../_lib/marketLabel";

export default function MarketEditor({ market, userId, onSettingsSaved, onSaved, onSavingChange }: {
  market: SavedMarket;
  userId: string;
  onSettingsSaved: (marketId: string, changes: MarketUpdates) => void;
  onSaved: (message?: string) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState(() => sanitizeOutcomeColors(market.outcome_colors));
  const [saved, setSaved] = useState(draft);
  const [label, setLabel] = useState(market.label);
  const [savedLabel, setSavedLabel] = useState(market.label);
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

  const colorsDirty = Object.keys({ ...saved, ...draft }).some((token) => saved[token] !== draft[token]);
  const dirty = label.trim() !== savedLabel || colorsDirty;

  function changeColor(token: string, value: string) {
    const next = { ...draft };
    if (isOutcomeColor(value)) next[token] = value;
    else delete next[token];
    setDraft(next);
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!dirty) { onSaved(); return; }
    setSaving(true);
    onSavingChange(true);
    setMessage(null);
    try {
      const defaultTitle = info?.title ?? (!label.trim() ? (await fetchEvent(market.slug))?.title : undefined);
      const nextLabel = resolveMarketLabel(label, defaultTitle);
      if (!nextLabel) {
        setMessage("Could not load the Polymarket title. Enter a label or try loading the outcomes again.");
        return;
      }
      const labelChanged = nextLabel !== savedLabel;
      if (labelChanged) {
        if (!(await saveMarketLabel(userId, market.id, nextLabel))) {
          setMessage("Could not save the label. Your edits are still here; please try again.");
          return;
        }
        setSavedLabel(nextLabel);
        onSettingsSaved(market.id, { label: nextLabel });
      }
      setLabel(nextLabel);
      if (colorsDirty) {
        const result = await saveMarketOutcomeColors(userId, market.id, draft);
        if (!result) {
          setMessage(labelChanged ? "Label saved, but colors could not be saved. Please try again." : "Could not save colors. Please try again.");
          return;
        }
        setSaved(draft);
        onSettingsSaved(market.id, { outcome_colors: draft });
        onSaved(result === "synced"
          ? "Changes saved across your devices."
          : labelChanged ? "Label saved across your devices. Colors saved in this browser only." : "Colors saved in this browser only. Cross-device sync is not available yet.");
      } else {
        onSaved("Label saved across your devices.");
      }
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  return (
    <form id={`market-editor-${market.id}`} onSubmit={save} className="mt-3 border-t border-white/10 pt-3" aria-label={`Settings for ${market.label}`}>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-white/80">Market label</span>
        <input
          aria-label="Market label"
          value={label}
          onChange={(event) => { setLabel(event.target.value); setMessage(null); }}
          disabled={saving}
          placeholder={info?.title || "Use the Polymarket title"}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-base text-white outline-none focus:border-white/40 disabled:opacity-50"
        />
        <span className="mt-1 block text-xs text-white/40">Leave blank to use the Polymarket title.</span>
      </label>
      <p className="mb-1 text-sm text-white/80">Outcome colors</p>
      <p className="mb-3 text-xs leading-relaxed text-white/50">
        Default uses blue for Democrat/(D) and red for Republican/(R). Markets with multiple choices for the same party keep the regular palette. Manual colors always take priority.
      </p>
      {loading ? (
        <p role="status" className="py-2 text-sm text-white/50">Loading outcomes...</p>
      ) : !info ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/50">Could not load this market&apos;s outcomes.</p>
          <button
            type="button"
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
        </>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={saving || Object.keys(draft).length === 0}
          onClick={() => { setDraft({}); setMessage(null); }}
          className="text-xs text-white/50 hover:text-white/80 disabled:opacity-40"
        >
          Reset to defaults
        </button>
      </div>
      {message && <p role="status" className="mt-2 text-xs leading-relaxed text-white/60">{message}</p>}
    </form>
  );
}
