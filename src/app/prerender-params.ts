import { serverApiOrigin } from "./config"

const FETCH_TIMEOUT_MS = 20_000
// Psalms (150) is the largest real book; anything beyond this is bad data
// that would otherwise explode the number of generated routes.
const MAX_CHAPTERS_PER_BOOK = 200
// The canon is 73 books. A response claiming far more is bad data, and without
// this the per-book cap still leaves the total unbounded — enough book records
// would exhaust build memory during route expansion, before the [] fallback
// below could ever run.
const MAX_BOOKS = 200

/**
 * Build the { book, chapter } route params for every chapter of every book,
 * fetched from the live API at build time. Mirrors BookService.getUrlAbrv
 * (abbreviation without spaces, lowercased) so the generated URLs match the
 * ones the app navigates to.
 *
 * Returns [] instead of throwing when the API is unreachable so builds
 * without network access still succeed — chapter pages then fall back to
 * client-side rendering, exactly like before prerendering existed.
 */
export async function fetchPrerenderChapterParams(
  fetchFn: typeof fetch = fetch,
): Promise<{ book: string; chapter: string }[]> {
  try {
    const response = await fetchFn(`${serverApiOrigin}/v1/books`, {
      headers: { accept: "application/json" },
      // A stalled request must fail into the catch/[] fallback instead of
      // hanging the whole prerender build.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET /v1/books responded ${response.status}`)
    }
    const books = (await response.json()) as Book[]
    if (!Array.isArray(books)) {
      throw new Error("GET /v1/books did not return an array")
    }

    if (books.length > MAX_BOOKS) {
      throw new Error(
        `GET /v1/books returned ${books.length} books (max ${MAX_BOOKS})`,
      )
    }

    return books
      .map((book) => ({
        urlAbrv:
          typeof book?.abrv === "string"
            ? book.abrv.replace(/\s/g, "").toLowerCase()
            : "",
        chapterCount: book?.chapterCount,
      }))
      .filter(
        (book) =>
          book.urlAbrv.length > 0 &&
          Number.isInteger(book.chapterCount) &&
          book.chapterCount > 0 &&
          book.chapterCount <= MAX_CHAPTERS_PER_BOOK,
      )
      .flatMap((book) =>
        Array.from({ length: book.chapterCount }, (_, index) => ({
          book: book.urlAbrv,
          chapter: `${index + 1}`,
        })),
      )
  } catch (error) {
    console.warn(
      `Prerender: could not fetch the book list (${
        error instanceof Error ? error.message : error
      }); chapter pages will fall back to client-side rendering.`,
    )
    return []
  }
}
