import { NextRequest, NextResponse } from "next/server";

type GoogleVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    pageCount?: number;
    description?: string;
    publisher?: string;
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
    };
  };
};

type OpenLibraryBook = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  publisher?: string[];
  cover_i?: number;
};

type SearchResult = {
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

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function pause(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function plainText(value?: string) {
  if (!value) return null;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ items: [] });

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google Books is not configured." }, { status: 500 });
  }

  const googleParams = new URLSearchParams({
    q: query,
    key: apiKey,
    printType: "books",
    orderBy: "relevance",
    maxResults: "10",
  });

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${googleParams}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = (await response.json()) as { items?: GoogleVolume[] };
          const items: SearchResult[] = (data.items ?? []).flatMap((volume) => {
            const info = volume.volumeInfo;
            if (!volume.id || !info?.title) return [];
            const publishedYear = info.publishedDate?.match(/^\d{4}/)?.[0];
            const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;

            return [{
              id: volume.id,
              title: info.title,
              subtitle: info.subtitle ?? null,
              author: info.authors?.join(", ") ?? null,
              pages: info.pageCount ?? null,
              publishedYear: publishedYear ? Number(publishedYear) : null,
              publisher: info.publisher ?? null,
              description: plainText(info.description),
              cover: cover?.replace(/^http:/, "https:") ?? null,
            }];
          });
          return NextResponse.json({ items });
        }

        if (!RETRYABLE_STATUSES.has(response.status)) {
          const message = response.status === 403
            ? "Google Books access was denied. Check the API key restrictions."
            : "Google Books could not complete this search.";
          return NextResponse.json({ error: message }, { status: response.status });
        }
      } catch {
        // Treat network errors and timeouts like temporary Google failures.
      }

      if (attempt < 2) await pause(attempt === 0 ? 250 : 700);
    }

    const openLibraryParams = new URLSearchParams({
      q: query,
      fields: "key,title,author_name,first_publish_year,number_of_pages_median,publisher,cover_i",
      limit: "10",
    });
    const fallbackResponse = await fetch(`https://openlibrary.org/search.json?${openLibraryParams}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "ProjectOSBookTracker/1.0" },
    });

    if (!fallbackResponse.ok) throw new Error("Fallback search failed");
    const fallbackData = (await fallbackResponse.json()) as { docs?: OpenLibraryBook[] };
    const items: SearchResult[] = (fallbackData.docs ?? []).flatMap((book) => {
      if (!book.key || !book.title) return [];
      return [{
        id: `openlibrary:${book.key}`,
        title: book.title,
        subtitle: null,
        author: book.author_name?.join(", ") ?? null,
        pages: book.number_of_pages_median ?? null,
        publishedYear: book.first_publish_year ?? null,
        publisher: book.publisher?.[0] ?? null,
        description: null,
        cover: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
      }];
    });
    return NextResponse.json({ items, source: "openlibrary" });
  } catch {
    return NextResponse.json(
      { error: "Book search is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }
}
