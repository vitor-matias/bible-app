import { SHARED_BOOK_INTROS } from "./bible-canon"
import { serverApiOrigin } from "./config"

const FETCH_TIMEOUT_MS = 20_000
// Psalms (150) is the largest real book; more is bad data.
const MAX_CHAPTERS_PER_BOOK = 200
// The canon is 73 books; the per-book cap alone leaves the total unbounded, and
// enough records would exhaust build memory before the [] fallback runs.
const MAX_ITEMS = 200

/**
 * Build-time GET of a JSON array. Returns [] instead of throwing so builds
 * without network access succeed; those pages fall back to client rendering.
 */
async function fetchArray<T>(
  fetchFn: typeof fetch,
  path: string,
  what: string,
): Promise<T[]> {
  try {
    const response = await fetchFn(`${serverApiOrigin}${path}`, {
      headers: { accept: "application/json" },
      // A stalled request must not hang the prerender build.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${path} responded ${response.status}`)
    }
    const items = (await response.json()) as T[]
    if (!Array.isArray(items)) {
      throw new Error(`GET ${path} did not return an array`)
    }
    if (items.length > MAX_ITEMS) {
      throw new Error(
        `GET ${path} returned ${items.length} entries (max ${MAX_ITEMS})`,
      )
    }
    return items
  } catch (error) {
    console.warn(
      `Prerender: could not fetch ${what} (${
        error instanceof Error ? error.message : error
      }); those pages will fall back to client-side rendering.`,
    )
    return []
  }
}

/**
 * One param set per chapter, plus /intro for books that have one. The URL
 * abbreviation must mirror BookService.getUrlAbrv.
 */
async function fetchBookParams(
  fetchFn: typeof fetch,
): Promise<{ book: string; chapter: string }[]> {
  const books = await fetchArray<Book>(fetchFn, "/v1/books", "the book list")
  return books
    .map((book) => ({
      urlAbrv:
        typeof book?.abrv === "string"
          ? book.abrv.replace(/\s/g, "").toLowerCase()
          : "",
      chapterCount: book?.chapterCount,
      // Own introduction, or the one shared by its cluster (Samuel, Reis, …).
      hasIntroduction:
        (Array.isArray(book?.introduction) && book.introduction.length > 0) ||
        !!SHARED_BOOK_INTROS[book?.id],
    }))
    .filter((book) => book.urlAbrv.length > 0)
    .flatMap((book) => {
      // The intro route does not depend on the chapter count being sane.
      const introRoutes = book.hasIntroduction
        ? [{ book: book.urlAbrv, chapter: "intro" }]
        : []
      const hasUsableChapterCount =
        Number.isInteger(book.chapterCount) &&
        book.chapterCount > 0 &&
        book.chapterCount <= MAX_CHAPTERS_PER_BOOK
      if (!hasUsableChapterCount) return introRoutes
      return [
        ...introRoutes,
        ...Array.from({ length: book.chapterCount }, (_, index) => ({
          book: book.urlAbrv,
          chapter: `${index + 1}`,
        })),
      ]
    })
}

/** Standalone introductions (/:slug/intro) come from their own endpoint. */
async function fetchIntroParams(
  fetchFn: typeof fetch,
): Promise<{ book: string; chapter: string }[]> {
  const intros = await fetchArray<IntroSummary>(
    fetchFn,
    "/v1/intros",
    "the standalone introductions",
  )
  return intros
    .map((intro) => (typeof intro?.slug === "string" ? intro.slug.trim() : ""))
    .filter((slug) => slug.length > 0)
    .map((slug) => ({ book: slug, chapter: "intro" }))
}

/** Every route to prerender: chapters, book intros and standalone intros. */
export async function fetchPrerenderChapterParams(
  fetchFn: typeof fetch = fetch,
): Promise<{ book: string; chapter: string }[]> {
  const [books, intros] = await Promise.all([
    fetchBookParams(fetchFn),
    fetchIntroParams(fetchFn),
  ])
  return [...books, ...intros]
}
