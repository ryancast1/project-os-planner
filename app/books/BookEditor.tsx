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
  };
}

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export default function BookEditor({
  book,
  onSaved,
}: {
  book: BookRecord;
  onSaved: (book: BookRecord) => void;
}) {
  const [draft, setDraft] = useState(() => createDraft(book));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const inputClass = "w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-white/25";
  const labelClass = "mb-1 block text-[11px] text-white/45";

  async function save() {
    const title = draft.title.trim();
    if (!title) {
      setMessage("Title is required.");
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
    };

    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("books")
      .update(payload)
      .eq("id", book.id)
      .select("id,owned,reading_status,title,author,pages,original_pub_year,date_added,date_read,rank,re_read,source,pages_of_text,current_page,notes")
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

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3" onClick={(event) => event.stopPropagation()}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="col-span-2 sm:col-span-2">
          <span className={labelClass}>Title</span>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Author</span>
          <input value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Status</span>
          <select value={draft.readingStatus} onChange={(event) => setDraft({ ...draft, readingStatus: event.target.value as Draft["readingStatus"] })} className={inputClass}>
            <option value="unread">Unread</option>
            <option value="reading">Reading</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label>
          <span className={labelClass}>Pages</span>
          <input type="number" min="1" value={draft.pages} onChange={(event) => setDraft({ ...draft, pages: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Original Pub Year</span>
          <input type="number" min="-5000" max="2100" value={draft.originalPubYear} onChange={(event) => setDraft({ ...draft, originalPubYear: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Date Added</span>
          <input type="date" value={draft.dateAdded} onChange={(event) => setDraft({ ...draft, dateAdded: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Date Read</span>
          <input type="date" value={draft.dateRead} onChange={(event) => setDraft({ ...draft, dateRead: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Rank</span>
          <input type="number" min="1" value={draft.rank} onChange={(event) => setDraft({ ...draft, rank: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Source</span>
          <input value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Pages of Text</span>
          <input type="number" min="0" value={draft.pagesOfText} onChange={(event) => setDraft({ ...draft, pagesOfText: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>Current Page</span>
          <input type="number" min="0" value={draft.currentPage} onChange={(event) => setDraft({ ...draft, currentPage: event.target.value })} className={inputClass} />
        </label>
        <div className="flex items-end gap-5 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={draft.owned} onChange={(event) => setDraft({ ...draft, owned: event.target.checked })} /> Owned
          </label>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={draft.reRead} onChange={(event) => setDraft({ ...draft, reRead: event.target.checked })} /> Re-read
          </label>
        </div>
      </div>

      <label className="mt-2 block">
        <span className={labelClass}>Notes</span>
        <textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className={inputClass} />
      </label>

      <div className="mt-3 flex items-center justify-end gap-3">
        {message ? <div className={message.startsWith("Save failed") ? "text-xs text-red-300" : "text-xs text-white/55"}>{message}</div> : null}
        <button type="button" disabled={saving} onClick={save} className="h-10 rounded-xl bg-white px-5 text-sm font-semibold text-black disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
