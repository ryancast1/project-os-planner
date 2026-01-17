"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SickEvent = {
  id: string;
  user_id: string;
  first_sign_date: string; // date
  event_type: string;
  note: string;
  created_at: string;
  updated_at: string;
};

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function SickPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<SickEvent[]>([]);

  const [date, setDate] = useState<string>(todayISODate());
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => b.first_sign_date.localeCompare(a.first_sign_date));
  }, [rows]);

  async function load() {
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from("sick_events")
      .select("id,user_id,first_sign_date,event_type,note,created_at,updated_at")
      .eq("event_type", "sick")
      .order("first_sign_date", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as SickEvent[]);
    setLoading(false);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("sick_events_sick_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sick_events" },
        (payload) => {
          // Only reload if it affects 'sick' rows (insert/update/delete).
          // Fast path: just reload; table is small.
          void load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addEvent() {
    const d = date.trim();
    const n = note.trim();
    if (!d || !n) {
      setErr("Add a date and a note.");
      return;
    }

    setSaving(true);
    setErr(null);

    const { error } = await supabase.from("sick_events").insert({
      first_sign_date: d,
      event_type: "sick",
      note: n,
    });

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setNote("");
    await load();
    requestAnimationFrame(() => noteRef.current?.focus());
  }

  function startEdit(r: SickEvent) {
    if (editingId === r.id) return;
    setErr(null);
    setEditingId(r.id);
    setEditingText(r.note ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  async function saveEdit(id: string) {
    const next = editingText.trimEnd();
    setSavingEdit(true);
    setErr(null);

    const { error } = await supabase
      .from("sick_events")
      .update({ note: next })
      .eq("id", id);

    setSavingEdit(false);

    if (error) {
      setErr(error.message);
      return;
    }

    cancelEdit();
    await load();
  }

  return (
    <div>
      {/* Add */}
      <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
        <div className="flex items-end gap-3">
          <div className="w-[160px]">
            <label className="text-xs font-semibold text-neutral-400">First sign date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-base text-neutral-100 outline-none focus:border-neutral-500"
            />
          </div>

          <button
            onClick={addEvent}
            disabled={saving}
            className="ml-auto shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>

        <div className="mt-3">
          <label className="text-xs font-semibold text-neutral-400">Notes</label>
          <textarea
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="mt-1 w-full resize-none rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-base text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-500"
          />
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        ) : null}
      </section>

      {/* List */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-neutral-300">All entries</div>
          <div className="text-xs text-neutral-500">{loading ? "Loading…" : `${sorted.length}`}</div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/20">
          <div className="grid grid-cols-[110px_1fr] gap-0 border-b border-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-400">
            <div>Date</div>
            <div>Notes</div>
          </div>

          {loading ? (
            <div className="px-4 py-3 text-sm text-neutral-500">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="px-4 py-3 text-sm text-neutral-500">No entries yet.</div>
          ) : (
            sorted.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[110px_1fr] gap-0 border-b border-neutral-900 px-4 py-3"
              >
                <div className="text-sm font-semibold text-neutral-200">{r.first_sign_date}</div>
                {editingId === r.id ? (
                  <div className="py-0">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={4}
                      className="w-full resize-none rounded-xl border border-neutral-700 bg-black/40 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none focus:border-neutral-500"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => saveEdit(r.id)}
                        disabled={savingEdit}
                        className="rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-950 disabled:opacity-50"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className="rounded-xl border border-neutral-700 bg-black/30 px-3 py-2 text-xs font-semibold text-neutral-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="w-full text-left whitespace-pre-wrap break-words rounded-xl px-1 py-1 text-sm leading-6 text-neutral-100 hover:bg-neutral-950/40"
                    title="Click to edit"
                  >
                    {r.note}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
