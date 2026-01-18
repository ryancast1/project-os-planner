const TMDB_API_KEY = "660b324a59170195b04accf0becfdc39";
const TMDB_READ_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2NjBiMzI0YTU5MTcwMTk1YjA0YWNjZjBiZWNmZGMzOSIsIm5iZiI6MTc2ODc3MTA4OC45MTYsInN1YiI6IjY5NmQ0ZTEwYzQ4MDExM2Q2ZTY4YTAwZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.gha91v71cXFYhcvHifd7nrjY51GaPJmm9GmUWgFcL-M";

export type TMDBSearchResult = {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
};

export type TMDBMovieDetails = {
  id: number;
  title: string;
  release_date: string;
  runtime: number | null;
  overview: string;
  poster_path: string | null;
  genres: { id: number; name: string }[];
};

/**
 * Search for movies by title
 */
export async function searchMovies(query: string): Promise<TMDBSearchResult[]> {
  if (!query.trim()) return [];

  try {
    const url = new URL("https://api.themoviedb.org/3/search/movie");
    url.searchParams.set("query", query);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "en-US");
    url.searchParams.set("page", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${TMDB_READ_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.statusText}`);
    }

    const data = await response.json();
    return (data.results || []).slice(0, 10); // Return top 10 results
  } catch (error) {
    console.error("TMDB search error:", error);
    return [];
  }
}

/**
 * Get detailed information about a movie
 */
export async function getMovieDetails(movieId: number): Promise<TMDBMovieDetails | null> {
  try {
    const url = `https://api.themoviedb.org/3/movie/${movieId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TMDB_READ_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("TMDB details error:", error);
    return null;
  }
}

/**
 * Get poster URL from path
 */
export function getPosterUrl(posterPath: string | null, size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original" = "w154"): string | null {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}
