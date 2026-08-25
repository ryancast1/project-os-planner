"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type BookRecord = {
  id: string;
  owned: boolean;
  reading_status: "unread" | "reading" | "read";
  title: string;
  author: string | null;
  pages: number | null;
  original_pub_year: number | null;
  date_added: string | null;
  date_read: string | null;
  rank: number | null;
  re_read: boolean;
  source: string | null;
  pages_of_text: number | null;
  current_page: number | null;
  notes: string | null;
  rating: number | null;
};

type Draft = {
  owned: boolean;
  readingStatus: BookRecord["reading_status"];
  title: string;
  author: string;
  pages: string;
  originalPubYear: string;
  dateAdded: string;
  dateRead: string;
  rank: string;
  reRead: boolean;
  source: string;
  pagesOfText: string;
  currentPage: string;
  notes: string;
  rating: string;
};

function createDraft(book: BookRecord): Draft {
  return {
    owned: book.owned,
    readingStatus: book.reading_status,
    title: book.title,
    author: book.author ?? "",
    pages: book.pages === null ? "" : String(book.pages),
    originalPubYear: book.original_pub_year === null ? "" : String(book.original_pub_year),
    dateAdded: book.date_added ?? "",
    dateRead: book.date_read ?? "",
    rank: book.rank === null ? "" : String(book.rank),
    reRead: book.re_read,
    source: book.source ?? "",
    pagesOfText: book.pages_of_text === null ? "" : String(book.pages_of_text),
    currentPage: book.current_page === null ? "" : String(book.current_page),
    notes: book.notes ?? "",
    rating: book.rating === null ? "" : String(book.rating),
  };
}

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export default function BookEditor({
  book,
  onSaved,
  onDeleted,
}: {
  book: BookRecord;
  onSaved: (book: BookRecord) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState(() => createDraft(book));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // iPhone Safari zooms focused form controls when their font size is below 16px.
  const inputClass = "min-w-0 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white outline-none focus:border-white/30";
  const labelClass = "mb-1.5 block text-xs font-medium text-white/50";

  async function save() {
    const title = draft.title.trim();
    if (!title) {
      setMessage("Title is required.");
      return;
    }
    const rating = nullableNumber(draft.rating);
    if (rating !== null && (rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2))) {
      setMessage("Rating must be between 0.5 and 5 in half-star steps.");
      return;
    }

    const payload = {
      owned: draft.owned,
      reading_status: draft.readingStatus,
      title,
      author: draft.author.trim() || null,
      pages: nullableNumber(draft.pages),
      original_pub_year: nullableNumber(draft.originalPubYear),
      date_added: draft.dateAdded || null,
      date_read: draft.dateRead || null,
      rank: nullableNumber(draft.rank),
      re_read: draft.reRead,
      source: draft.source.trim() || null,
      pages_of_text: nullableNumber(draft.pagesOfText),
      current_page: nullableNumber(draft.currentPage),
      notes: draft.notes.trim() || null,
      rating: draft.readingStatus === "read" ? rating : null,
    };

    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("books")
      .update(payload)
      .eq("id", book.id)
      .select("id,owned,reading_status,title,author,pages,original_pub_year,date_added,date_read,rank,re_read,source,pages_of_text,current_page,notes,rating")
      .single();

    if (error) {
      setMessage(`Save failed: ${error.message}`);
      setSaving(false);
      return;
    }

    onSaved(data as BookRecord);
    setMessage("Saved ✓");
    setSaving(false);
  }

  async function deleteBook() {
    if (!window.confirm(`Delete “${book.title}”? This cannot be undone.`)) return;

    setDeleting(true);
    setMessage(null);
    let affected: Array<{ id: string; rank: number | null }> = [];

    if (book.reading_status === "unread" && book.rank !== null && book.rank !== 99) {
      const { data, error } = await supabase
        .from("books")
        .select("id,rank")
        .eq("reading_status", "unread")
        .gt("rank", book.rank)
        .neq("rank", 99);
      if (error) {
        setMessage(`Delete failed: ${error.message}`);
        setDeleting(false);
        return;
      }
      affected = data ?? [];
    }

    const { error: deleteError } = await supabase.from("books").delete().eq("id", book.id);
    if (deleteError) {
      setMessage(`Delete failed: ${deleteError.message}`);
      setDeleting(false);
      return;
    }

    const results = await Promise.all(affected.map((item) =>
      supabase.from("books").update({ rank: (item.rank ?? 1) - 1 }).eq("id", item.id)
    ));
    const rankError = results.find((result) => result.error)?.error;
    if (rankError) setMessage(`Book deleted, but rank update failed: ${rankError.message}`);
    onDeleted(book.id);
  }

  return (
    <div className="mt-3 min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4" onClick={(event) => event.stopPropagation()}>
      <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
        <label className="min-w-0 sm:col-span-2">
          <span className={labelClass}>Title</span>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Author</span>
          <input value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Status</span>
          <select value={draft.readingStatus} onChange={(event) => setDraft({ ...draft, readingStatus: event.target.value as Draft["readingStatus"] })} className={inputClass}>
            <option value="unread">Unread</option>
            <option value="reading">Reading</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Pages</span>
          <input type="number" min="1" value={draft.pages} onChange={(event) => setDraft({ ...draft, pages: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Original Pub Year</span>
          <input type="number" min="-5000" max="2100" value={draft.originalPubYear} onChange={(event) => setDraft({ ...draft, originalPubYear: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Date Added</span>
          <div className="flex min-w-0 gap-2">
            <input type="date" value={draft.dateAdded} onChange={(event) => setDraft({ ...draft, dateAdded: event.target.value })} className={inputClass} />
            <button type="button" disabled={!draft.dateAdded} onClick={() => setDraft({ ...draft, dateAdded: "" })} className="shrink-0 rounded-xl border border-white/10 px-3 text-sm text-white/65 disabled:opacity-30">
              Clear
            </button>
          </div>
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Date Read</span>
          <div className="flex min-w-0 gap-2">
            <input type="date" value={draft.dateRead} onChange={(event) => setDraft({ ...draft, dateRead: event.target.value })} className={inputClass} />
            <button type="button" disabled={!draft.dateRead} onClick={() => setDraft({ ...draft, dateRead: "" })} className="shrink-0 rounded-xl border border-white/10 px-3 text-sm text-white/65 disabled:opacity-30">
              Clear
            </button>
          </div>
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Rank</span>
          <input type="number" min="1" value={draft.rank} onChange={(event) => setDraft({ ...draft, rank: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Source</span>
          <input value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Pages of Text</span>
          <input type="number" min="0" value={draft.pagesOfText} onChange={(event) => setDraft({ ...draft, pagesOfText: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Current Page</span>
          <input type="number" min="0" value={draft.currentPage} onChange={(event) => setDraft({ ...draft, currentPage: event.target.value })} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 text-base text-white/75">
            <input type="checkbox" checked={draft.owned} onChange={(event) => setDraft({ ...draft, owned: event.target.checked })} className="h-5 w-5 shrink-0" /> Owned
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 text-base text-white/75">
            <input type="checkbox" checked={draft.reRead} onChange={(event) => setDraft({ ...draft, reRead: event.target.checked })} className="h-5 w-5 shrink-0" /> Re-read
          </label>
        </div>
        {draft.readingStatus === "read" ? (
          <label className="min-w-0 sm:col-span-2">
            <span className={labelClass}>Rating</span>
            <input type="number" inputMode="decimal" min="0.5" max="5" step="0.5" value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value })} placeholder="0.5–5" className={inputClass} />
          </label>
        ) : null}
      </div>

      <label className="mt-4 block min-w-0">
        <span className={labelClass}>Notes</span>
        <textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className={inputClass} />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" disabled={saving || deleting} onClick={deleteBook} className="h-11 w-full rounded-xl border border-red-400/25 bg-red-500/10 px-5 text-base font-semibold text-red-300 disabled:opacity-50 sm:w-auto">
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <div className="flex-1">
          {message ? <div className={message.includes("failed") ? "text-xs text-red-300" : "text-xs text-white/55"}>{message}</div> : null}
        </div>
        <button type="button" disabled={saving || deleting} onClick={save} className="h-11 w-full rounded-xl bg-white px-6 text-base font-semibold text-black disabled:opacity-60 sm:w-auto">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
