"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type BookSearchResult = {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  pages: number | null;
  publishedYear: number | null;
  publisher: string | null;
  description: string | null;
  cover: string | null;
};

export default function AddBookPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      fetch(`/books/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { items?: BookSearchResult[]; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Search failed.");
          setSearchResults(payload.items ?? []);
          setShowResults(true);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSearchError(error instanceof Error ? error.message : "Search failed.");
          setSearchResults([]);
          setShowResults(true);
        })
        .finally(() => setSearching(false));
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  function selectBook(book: BookSearchResult) {
    setTitle(book.title);
    setAuthor(book.author ?? "");
    setPages(book.pages ? String(book.pages) : "");
    setYear(book.publishedYear ? String(book.publishedYear) : "");
    setNotes(book.description ?? "");
    setSearchQuery("");
    setShowResults(false);
    setSearchError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const data = new FormData(event.currentTarget);
    const cleanTitle = String(data.get("title") ?? "").trim();
    if (!cleanTitle) return;

    const status = String(data.get("status") ?? "unread") as "unread" | "reading" | "read";
    const pagesText = String(data.get("pages") ?? "").trim();
    const yearText = String(data.get("year") ?? "").trim();
    const onDeck = data.get("onDeck") === "on";

    setSaving(true);
    setMessage(null);

    const { error } = await supabase.from("books").insert({
      title: cleanTitle,
      author: String(data.get("author") ?? "").trim() || null,
      owned: data.get("owned") === "true",
      reading_status: status,
      pages: pagesText ? Number(pagesText) : null,
      original_pub_year: yearText ? Number(yearText) : null,
      rank: status === "unread" && onDeck ? 99 : null,
      re_read: data.get("reRead") === "on",
      source: String(data.get("source") ?? "").trim() || null,
      notes: String(data.get("notes") ?? "").trim() || null,
    });

    if (error) {
      setMessage(`Save failed: ${error.message}`);
      setSaving(false);
      return;
    }

    router.push("/books");
    router.refresh();
  }

  const inputClass = "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20 focus:bg-black/40";

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Add a Book</h1>
          <Link href="/books" className="mt-2 inline-block text-sm text-white/60 underline underline-offset-4 hover:text-white">Back</Link>
        </header>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-4">
            <div className="relative">
              <label className="block">
                <span className="mb-1 block text-center text-xs text-white/60">Search Google Books</span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  placeholder="Start typing a title or author..."
                  autoComplete="off"
                  className={inputClass}
                />
              </label>

              {searching ? <div className="mt-2 text-center text-sm text-white/60">Searching…</div> : null}
              {searchError ? <div className="mt-2 text-center text-sm text-red-300">{searchError}</div> : null}

              {showResults ? (
                <div className="absolute z-20 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
                  {searchResults.length === 0 && !searching && !searchError ? (
                    <div className="p-4 text-center text-sm text-white/60">No books found.</div>
                  ) : searchResults.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => selectBook(book)}
                      className="flex w-full items-start gap-3 border-b border-white/5 p-3 text-left transition last:border-b-0 hover:bg-white/5"
                    >
                      {book.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={book.cover} alt="" className="h-[72px] w-12 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="grid h-[72px] w-12 shrink-0 place-items-center rounded bg-white/5 px-1 text-center text-[10px] text-white/30">No cover</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white">{book.title}</div>
                        {book.author ? <div className="mt-0.5 text-sm text-white/60">{book.author}</div> : null}
                        <div className="mt-1 text-xs text-white/40">
                          {[book.publishedYear, book.pages ? `${book.pages} pages` : null, book.publisher].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="block">
              <span className="mb-1 block text-center text-xs text-white/60">Title</span>
              <input required name="title" value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
            </label>

            <label className="block">
              <span className="mb-1 block text-center text-xs text-white/60">Author</span>
              <input name="author" value={author} onChange={(event) => setAuthor(event.target.value)} className={inputClass} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-center text-xs text-white/60">Status</span>
                <select name="status" defaultValue="unread" className={inputClass}>
                  <option value="unread">Unread</option>
                  <option value="reading">Reading</option>
                  <option value="read">Read</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-center text-xs text-white/60">Owned</span>
                <select name="owned" defaultValue="false" className={inputClass}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-center text-xs text-white/60">Pages</span>
                <input name="pages" value={pages} onChange={(event) => setPages(event.target.value)} type="number" min="1" inputMode="numeric" className={inputClass} />
              </label>
              <label>
                <span className="mb-1 block text-center text-xs text-white/60">Original Pub Year</span>
                <input name="year" value={year} onChange={(event) => setYear(event.target.value)} type="number" min="1000" max="2100" inputMode="numeric" className={inputClass} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-center text-xs text-white/60">Source</span>
              <input name="source" className={inputClass} />
            </label>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <label className="flex items-center gap-2 text-sm"><input name="onDeck" type="checkbox" className="h-4 w-4" /> On Deck</label>
              <label className="flex items-center gap-2 text-sm"><input name="reRead" type="checkbox" className="h-4 w-4" /> Re-read</label>
            </div>

            <label className="block">
              <span className="mb-1 block text-center text-xs text-white/60">Notes</span>
              <textarea name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className={inputClass} />
            </label>

            {message ? <div className="text-center text-sm text-white/60">{message}</div> : null}

            <button disabled={saving} type="submit" className="grid h-14 w-full place-items-center rounded-xl bg-white text-lg font-semibold text-black transition active:scale-[0.99] disabled:opacity-60">
              {saving ? "Saving…" : "Save Book"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
