"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BookRecord } from "./BookEditor";

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function formatTime(minutes: number) {
  const roundedMinutes = Math.ceil(minutes);
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

export default function CurrentlyReadingEditor({
  book,
  onSaved,
}: {
  book: BookRecord;
  onSaved: (book: BookRecord) => void;
}) {
  const [currentPage, setCurrentPage] = useState(book.current_page === null ? "" : String(book.current_page));
  const [firstPage, setFirstPage] = useState(book.first_page === null ? "1" : String(book.first_page));
  const [pagesOfText, setPagesOfText] = useState(book.pages_of_text === null ? "" : String(book.pages_of_text));
  const [notes, setNotes] = useState(book.notes ?? "");
  const [rating, setRating] = useState(book.rating === null ? "" : String(book.rating));
  const [showFinish, setShowFinish] = useState(false);
  const [showPace, setShowPace] = useState(false);
  const [pacePages, setPacePages] = useState("");
  const [paceMinutes, setPaceMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const inputClass = "min-w-0 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white outline-none focus:border-white/30";
  const labelClass = "mb-1.5 block text-xs font-medium text-white/50";
  const pacePageCount = nullableNumber(pacePages);
  const paceMinuteCount = nullableNumber(paceMinutes);
  const currentPageNumber = nullableNumber(currentPage);
  const lastPageNumber = nullableNumber(pagesOfText);
  const pagesPerHour = pacePageCount !== null && pacePageCount > 0 && paceMinuteCount !== null && paceMinuteCount > 0
    ? (pacePageCount / paceMinuteCount) * 60
    : null;
  const remainingPages = currentPageNumber !== null && lastPageNumber !== null
    ? Math.max(0, lastPageNumber - currentPageNumber)
    : null;
  const remainingMinutes = pagesPerHour !== null && remainingPages !== null
    ? (remainingPages / pagesPerHour) * 60
    : null;

  function readingDate() {
    const adjusted = new Date();
    adjusted.setHours(adjusted.getHours() - 4);
    return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, "0")}-${String(adjusted.getDate()).padStart(2, "0")}`;
  }

  function errorMessage(error: unknown) {
    return typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "Unknown error";
  }

  async function saveCheckpoint(pageNumber: number, markRead: boolean, numericRating: number | null) {
    const totalPages = nullableNumber(pagesOfText);
    const startingPage = nullableNumber(firstPage);
    const cleanNotes = notes.trim() || null;
    const loggedOn = readingDate();
    const { error } = await supabase.rpc("save_reading_progress", {
      p_book_id: book.id,
      p_page_number: pageNumber,
      p_first_page: startingPage,
      p_pages_of_text: totalPages,
      p_notes: cleanNotes,
      p_logged_on: loggedOn,
      p_mark_read: markRead,
      p_rating: numericRating,
    });
    if (error) throw error;

    onSaved({
      ...book,
      current_page: pageNumber,
      first_page: startingPage,
      pages_of_text: totalPages,
      notes: cleanNotes,
      reading_status: markRead ? "read" : book.reading_status,
      rank: markRead ? null : book.rank,
      date_read: markRead ? loggedOn : book.date_read,
      rating: markRead ? numericRating : book.rating,
    });
  }

  async function saveProgress() {
    const pageNumber = nullableNumber(currentPage);
    const startingPage = nullableNumber(firstPage);
    const totalPages = nullableNumber(pagesOfText);

    if (pageNumber === null) {
      if (startingPage === null || startingPage < 0 || !Number.isInteger(startingPage)) {
        setMessage("Enter a valid First Page.");
        return;
      }
      if (totalPages !== null && (!Number.isInteger(totalPages) || totalPages <= startingPage)) {
        setMessage("Last Page must be after First Page.");
        return;
      }

      const cleanNotes = notes.trim() || null;
      setSaving(true);
      setMessage(null);
      try {
        const { error } = await supabase
          .from("books")
          .update({
            current_page: startingPage,
            first_page: startingPage,
            pages_of_text: totalPages,
            notes: cleanNotes,
          })
          .eq("id", book.id);
        if (error) throw error;

        setCurrentPage(String(startingPage));
        onSaved({
          ...book,
          current_page: startingPage,
          first_page: startingPage,
          pages_of_text: totalPages,
          notes: cleanNotes,
        });
      } catch (error) {
        setMessage(`Save failed: ${errorMessage(error)}`);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
      setMessage("Enter the page you are currently up to.");
      return;
    }
    if (totalPages !== null && pageNumber > totalPages) {
      setMessage("Current page cannot be greater than Last Page.");
      return;
    }
    if (startingPage !== null && pageNumber < startingPage) {
      setMessage("Current page cannot be before First Page.");
      return;
    }
    if (startingPage !== null && totalPages !== null && totalPages <= startingPage) {
      setMessage("Last Page must be after First Page.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await saveCheckpoint(pageNumber, false, null);
      setMessage("Progress logged ✓");
    } catch (error) {
      setMessage(`Save failed: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function markRead() {
    const numericRating = nullableNumber(rating);
    const startingPage = nullableNumber(firstPage);
    if (numericRating !== null && (numericRating < 0.5 || numericRating > 5 || !Number.isInteger(numericRating * 2))) {
      setMessage("Rating must be between 0.5 and 5 in half-star steps.");
      setShowFinish(false);
      return;
    }
    const finalPage = nullableNumber(pagesOfText);
    if (finalPage === null || finalPage < 1 || !Number.isInteger(finalPage)) {
      setMessage("Enter Last Page before marking the book read.");
      setShowFinish(false);
      return;
    }
    if (startingPage !== null && finalPage <= startingPage) {
      setMessage("Last Page must be after First Page.");
      setShowFinish(false);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      setCurrentPage(String(finalPage));
      await saveCheckpoint(finalPage, true, numericRating);
      setShowFinish(false);
    } catch (error) {
      setMessage(`Mark read failed: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-4" onClick={(event) => event.stopPropagation()}>
      <label className="block text-center">
        <span className="mb-2 block text-sm font-semibold text-white/70">Current Page</span>
        <input type="number" min="0" inputMode="numeric" value={currentPage} onChange={(event) => setCurrentPage(event.target.value)} className={`${inputClass} h-16 text-center text-3xl font-semibold tabular-nums`} />
      </label>

      <div className="mt-4 grid grid-cols-3 items-end gap-2 sm:gap-3">
        <label className="min-w-0">
          <span className={labelClass}>First Page</span>
          <input type="number" min="0" inputMode="numeric" value={firstPage} onChange={(event) => setFirstPage(event.target.value)} className={`${inputClass} h-10 px-2 py-1.5 text-center text-base`} />
        </label>
        <label className="min-w-0">
          <span className={labelClass}>Last Page</span>
          <input type="number" min="0" inputMode="numeric" value={pagesOfText} onChange={(event) => setPagesOfText(event.target.value)} className={`${inputClass} h-10 px-2 py-1.5 text-center text-base`} />
        </label>
        <button
          type="button"
          onClick={() => setShowPace(true)}
          className="h-10 min-w-0 rounded-xl border border-white/10 bg-white/5 px-2 text-sm font-semibold text-white/70 transition active:scale-[0.98]"
        >
          Pace
        </button>
      </div>

      {showPace ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center" onClick={() => setShowPace(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="text-xl font-semibold">Pace Calculator</div>
            <div className="mt-1 truncate text-sm text-white/55">{book.title}</div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="min-w-0">
                <span className={labelClass}>Pages Read</span>
                <input type="number" min="1" inputMode="numeric" value={pacePages} onChange={(event) => setPacePages(event.target.value)} className={`${inputClass} text-center`} />
              </label>
              <label className="min-w-0">
                <span className={labelClass}>Minutes</span>
                <input type="number" min="1" inputMode="decimal" value={paceMinutes} onChange={(event) => setPaceMinutes(event.target.value)} className={`${inputClass} text-center`} />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-4">
                <div className="text-xs text-white/45">Pages per hour</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{pagesPerHour === null ? "—" : Number(pagesPerHour.toFixed(1))}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-4">
                <div className="text-xs text-white/45">Time remaining</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{remainingMinutes === null ? "—" : formatTime(remainingMinutes)}</div>
              </div>
            </div>

            <button type="button" onClick={() => setShowPace(false)} className="mt-5 h-11 w-full rounded-xl bg-white text-base font-semibold text-black">Done</button>
          </div>
        </div>
      ) : null}

      <label className="mt-4 block min-w-0">
        <span className={labelClass}>Notes</span>
        <textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${inputClass} resize-y`} />
      </label>

      {message ? <div className={message.includes("failed") ? "mt-3 text-sm text-red-300" : "mt-3 text-sm text-white/55"}>{message}</div> : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" disabled={saving} onClick={() => setShowFinish(true)} className="h-11 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white/85 disabled:opacity-50">
          Mark Read
        </button>
        <button type="button" disabled={saving} onClick={saveProgress} className="h-11 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-50">
          {saving ? "Saving…" : "Save Progress"}
        </button>
      </div>

      {showFinish ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center" onClick={() => !saving && setShowFinish(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="text-xl font-semibold">Finish Book</div>
            <div className="mt-1 text-sm text-white/55">{book.title}</div>
            <label className="mt-5 block">
              <span className={labelClass}>Rating</span>
              <input type="number" inputMode="decimal" min="0.5" max="5" step="0.5" value={rating} onChange={(event) => setRating(event.target.value)} placeholder="0.5–5" className={inputClass} />
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" disabled={saving} onClick={() => setShowFinish(false)} className="h-11 rounded-xl border border-white/10 bg-white/5 text-base font-semibold text-white/75 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={saving} onClick={markRead} className="h-11 rounded-xl bg-white text-base font-semibold text-black disabled:opacity-50">{saving ? "Saving…" : "Mark Read"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
