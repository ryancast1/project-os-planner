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

  const params = new URLSearchParams({
    q: query,
    key: apiKey,
    printType: "books",
    orderBy: "relevance",
    maxResults: "10",
  });

  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Google Books search failed. Check the API key restrictions." },
        { status: response.status }
      );
    }

    const data = (await response.json()) as { items?: GoogleVolume[] };
    const items = (data.items ?? []).flatMap((volume) => {
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
  } catch {
    return NextResponse.json({ error: "Could not reach Google Books." }, { status: 502 });
  }
}
