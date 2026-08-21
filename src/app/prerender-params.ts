import { SHARED_BOOK_INTROS } from "./bible-canon"
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
async function fetchBookParams(
  fetchFn: typeof fetch,
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
        // Either its own introduction, or the shared one the edition writes
        // for its cluster of books (Samuel, Reis, …) — both render at
        // /:book/intro.
        hasIntroduction:
          (Array.isArray(book?.introduction) && book.introduction.length > 0) ||
          !!SHARED_BOOK_INTROS[book?.id],
      }))
      .filter((book) => book.urlAbrv.length > 0)
      .flatMap((book) => {
        // An introduction is worth indexing on its own: it lives at
        // /:book/intro and does not depend on the chapter count being sane.
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
  } catch (error) {
    console.warn(
      `Prerender: could not fetch the book list (${
        error instanceof Error ? error.message : error
      }); chapter pages will fall back to client-side rendering.`,
    )
    return []
  }
}

/**
 * Standalone introductions — the whole Bible, a testament, a group of books —
 * are pages in their own right at /:slug/intro, and they come from a different
 * endpoint than the books, so they need their own pass. An unreachable
 * endpoint just means no introduction routes, like the book list above.
 */
async function fetchIntroParams(
  fetchFn: typeof fetch,
): Promise<{ book: string; chapter: string }[]> {
  try {
    const response = await fetchFn(`${serverApiOrigin}/v1/intros`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET /v1/intros responded ${response.status}`)
    }
    const intros = (await response.json()) as IntroSummary[]
    if (!Array.isArray(intros)) {
      throw new Error("GET /v1/intros did not return an array")
    }
    // Same bound as the book list: a response far larger than the canon is
    // bad data, not a reason to expand thousands of routes.
    if (intros.length > MAX_BOOKS) {
      throw new Error(
        `GET /v1/intros returned ${intros.length} introductions (max ${MAX_BOOKS})`,
      )
    }

    return intros
      .map((intro) =>
        typeof intro?.slug === "string" ? intro.slug.trim() : "",
      )
      .filter((slug) => slug.length > 0)
      .map((slug) => ({ book: slug, chapter: "intro" }))
  } catch (error) {
    console.warn(
      `Prerender: could not fetch the standalone introductions (${
        error instanceof Error ? error.message : error
      }); those pages will fall back to client-side rendering.`,
    )
    return []
  }
}

/**
 * Every route worth prerendering: a page per chapter, plus the introduction
 * pages — both the ones written for a single book and the standalone ones.
 */
export async function fetchPrerenderChapterParams(
  fetchFn: typeof fetch = fetch,
): Promise<{ book: string; chapter: string }[]> {
  const [books, intros] = await Promise.all([
    fetchBookParams(fetchFn),
    fetchIntroParams(fetchFn),
  ])
  return [...books, ...intros]
}
