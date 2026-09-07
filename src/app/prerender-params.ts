import { SHARED_BOOK_INTROS } from "./bible-canon"
import { serverApiOrigin } from "./config"

const FETCH_TIMEOUT_MS = 20_000
// Psalms (150) is the largest real book; anything beyond this is bad data
// that would otherwise explode the number of generated routes.
const MAX_CHAPTERS_PER_BOOK = 200
// The canon is 73 books, with one introduction per book or cluster. A response
// far larger than that is bad data, and the per-book cap alone still leaves the
// total unbounded — enough records would exhaust build memory during route
// expansion, before the [] fallback could ever run.
const MAX_ITEMS = 200

/**
 * GET a JSON array from the API that the prerenderer reads at build time.
 *
 * Returns [] instead of throwing when the endpoint is unreachable or answers
 * something unusable, so builds without network access still succeed — the
 * affected pages just fall back to client-side rendering, exactly like before
 * prerendering existed.
 */
async function fetchArray<T>(
  fetchFn: typeof fetch,
  path: string,
  what: string,
): Promise<T[]> {
  try {
    const response = await fetchFn(`${serverApiOrigin}${path}`, {
      headers: { accept: "application/json" },
      // A stalled request must fail into the [] fallback instead of hanging
      // the whole prerender build.
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
 * One param set per chapter of every book, plus the introduction route for the
 * books that have one. Mirrors BookService.getUrlAbrv (abbreviation without
 * spaces, lowercased) so the generated URLs match the ones the app navigates to.
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
}

/**
 * Standalone introductions — the whole Bible, a testament, a group of books —
 * are pages in their own right at /:slug/intro, and they come from a different
 * endpoint than the books, so they need their own pass.
 */
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
