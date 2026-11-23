"use client";

import { useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function NotesButton({ hasNotes, onClick }: { hasNotes: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`shrink-0 transition-colors ${hasNotes ? "text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}
      aria-label="Day notes"
      title="Day notes"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    </button>
  );
}

export function NotesModal({
  date, dateLabel, initialNotes, layer = "z-[100]", onSaved, onClose,
}: {
  date: string;
  dateLabel: string;
  initialNotes: string;
  layer?: string;
  onSaved: (date: string, notes: string) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const notes = draft ?? initialNotes;

  function close() {
    if (!pending.current) onClose();
  }

  async function save() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const { error } = await supabase
        .from("day_notes")
        .upsert({ note_date: date, notes, updated_at: new Date().toISOString() }, { onConflict: "note_date" });
      if (error) throw error;
      onSaved(date, notes);
      onClose();
    } catch (cause) {
      console.error("saveDayNotes", cause);
      setError("Could not save the note. Try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={`fixed inset-0 flex items-center justify-center p-4 ${layer}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        style={{ height: "min(75dvh, 600px)" }}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <h2 id={headingId} className="text-lg font-semibold text-neutral-100">Notes for {dateLabel}</h2>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setDraft(e.target.value)}
          readOnly={saving}
          aria-label="Day notes"
          placeholder="Add notes for this day..."
          className="min-h-0 w-full flex-1 resize-none rounded-xl border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-[16px] text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-neutral-500 sm:text-sm"
          autoFocus
        />
        {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        <div className="mt-3 flex shrink-0 justify-end">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
