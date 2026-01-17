"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";


type CCEntry = {
  id: string;
  user_id: string;
  person_name: string;
  note: string;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
};

function formatDateShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function linkify(text: string) {
  // Very small, practical linkifier for http(s) URLs.
  const parts = text.split(/(https?:\/\/[^\s)\]]+)/g);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return (
        <a
          key={i}
          href={p}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {p}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export default function CocktailChatterPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [entries, setEntries] = useState<CCEntry[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);

  // Add form
  const [personInput, setPersonInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const name = (e.person_name || "").trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filtered = useMemo(() => {
    const name = selectedPerson.trim();
    return entries
      .filter((e) => (name ? e.person_name === name : true))
      .filter((e) => (showArchived ? true : !e.is_archived))
      .sort((a, b) => {
        // newest first
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [entries, selectedPerson, showArchived]);

  const countsByPerson = useMemo(() => {
    const m = new Map<string, { active: number; archived: number }>();
    for (const e of entries) {
      const key = e.person_name;
      const cur = m.get(key) ?? { active: 0, archived: 0 };
      if (e.is_archived) cur.archived += 1;
      else cur.active += 1;
      m.set(key, cur);
    }
    return m;
  }, [entries]);

  async function load() {
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from("cc_entries")
      .select("id,user_id,person_name,note,is_archived,archived_at,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setEntries([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as CCEntry[];
    setEntries(rows);

    // Initialize selected person (keep current if still exists)
    setSelectedPerson((prev) => {
      const p = prev.trim();
      if (p && rows.some((r) => r.person_name === p)) return p;
      // default: first person with active entries, else first person overall
      const activePerson = rows.find((r) => !r.is_archived)?.person_name;
      return activePerson ?? rows[0]?.person_name ?? "";
    });

    setLoading(false);
  }

  useEffect(() => {
    load();

    // Realtime: refetch on any change in this table.
    // (RLS ensures we only ever see our own rows.)
    const channel = supabase
      .channel("cc_entries_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cc_entries" },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addEntry() {
    const person = personInput.trim();
    const note = noteInput.trim();
    if (!person || !note) {
      setErr("Add a person and a note.");
      return;
    }

    setSaving(true);
    setErr(null);

    const { error } = await supabase.from("cc_entries").insert({
      person_name: person,
      note,
      is_archived: false,
      archived_at: null,
    });

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setPersonInput(person);
    setNoteInput("");

    // Refresh list immediately (in case realtime is delayed)
    await load();

    // Keep the view scoped to the person we just added
    setSelectedPerson(person);

    // keep cursor in textarea for rapid entry
    requestAnimationFrame(() => noteRef.current?.focus());
  }

  async function archiveEntry(id: string) {
    setErr(null);
    const { error } = await supabase
      .from("cc_entries")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", id);

    if (error) setErr(error.message);
  }

  async function unarchiveEntry(id: string) {
    setErr(null);
    const { error } = await supabase
      .from("cc_entries")
      .update({ is_archived: false, archived_at: null })
      .eq("id", id);

    if (error) setErr(error.message);
  }

  function startEdit(e: CCEntry) {
    if (editingId === e.id) return;
    setErr(null);
    setEditingId(e.id);
    setEditingText(e.note ?? "");
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
      .from("cc_entries")
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
    <main className="min-h-[calc(100vh-80px)] bg-black px-4 pb-28 pt-4 text-neutral-100">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold tracking-wide text-neutral-200">CC</div>
          </div>

          <Link
            href="/"
            className="rounded-full border border-neutral-700 bg-neutral-950/40 px-4 py-2 text-sm font-semibold text-neutral-100"
          >
            Home
          </Link>
        </div>

        {/* Add */}
        <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-neutral-400">Person</label>
              <input
                value={personInput}
                onChange={(e) => setPersonInput(e.target.value)}
                list="cc_people"
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-base text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-500"
              />
              <datalist id="cc_people">
                {people.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <button
              onClick={addEntry}
              disabled={saving}
              className="shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add"}
            </button>
          </div>

          <div className="mt-3">
            <label className="text-xs font-semibold text-neutral-400">Note</label>
            <textarea
              ref={noteRef}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
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

        {/* People selector */}
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-300">People</div>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 accent-neutral-200"
              />
              Show archived
            </label>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {people.length === 0 ? (
              <div className="text-sm text-neutral-500">No entries yet.</div>
            ) : (
              people.map((p) => {
                const active = p === selectedPerson;
                const c = countsByPerson.get(p) ?? { active: 0, archived: 0 };
                const count = showArchived ? c.active + c.archived : c.active;
                return (
                  <button
                    key={p}
                    onClick={() => setSelectedPerson(p)}
                    className={
                      "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold " +
                      (active
                        ? "bg-neutral-100 text-neutral-950"
                        : "bg-neutral-950/40 text-neutral-200 border border-neutral-800")
                    }
                  >
                    {p}
                    <span className={"ml-2 text-xs " + (active ? "text-neutral-700" : "text-neutral-500")}>
                      {count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Entries list */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-300">
              {selectedPerson ? selectedPerson : "All"}
            </div>
            <div className="text-xs text-neutral-500">{loading ? "Loading…" : `${filtered.length} shown`}</div>
          </div>

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 px-4 py-3 text-sm text-neutral-500">
                Nothing here.
              </div>
            ) : (
              filtered.map((e) => {
                return (
                  <div
                    key={e.id}
                    className={
                      "rounded-2xl border border-neutral-800 bg-neutral-950/25 px-4 py-3 " +
                      (e.is_archived ? "opacity-70" : "")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-neutral-500">{formatDateShort(e.created_at)}</div>

                        {editingId === e.id ? (
                          <div className="mt-2">
                            <textarea
                              value={editingText}
                              onChange={(ev) => setEditingText(ev.target.value)}
                              rows={5}
                              className="w-full resize-none rounded-xl border border-neutral-700 bg-black/40 px-3 py-2 text-[15px] leading-6 text-neutral-100 outline-none focus:border-neutral-500"
                            />

                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => saveEdit(e.id)}
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
                            onClick={() => startEdit(e)}
                            className="mt-1 w-full text-left whitespace-pre-wrap break-words rounded-xl px-1 py-1 text-[15px] leading-6 text-neutral-100 hover:bg-neutral-950/40"
                            title="Click to edit"
                          >
                            {linkify(e.note)}
                          </button>
                        )}
                      </div>

                      <div className="shrink-0">
                        {e.is_archived ? (
                          <button
                            onClick={() => unarchiveEntry(e.id)}
                            className="rounded-xl border border-neutral-700 bg-black/30 px-3 py-2 text-xs font-semibold text-neutral-100"
                          >
                            Unarchive
                          </button>
                        ) : (
                          <button
                            onClick={() => archiveEntry(e.id)}
                            className="rounded-xl border border-neutral-700 bg-black/30 px-3 py-2 text-xs font-semibold text-neutral-100"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </div>

                    {e.is_archived && e.archived_at ? (
                      <div className="mt-2 text-xs text-neutral-500">Archived {formatDateShort(e.archived_at)}</div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}