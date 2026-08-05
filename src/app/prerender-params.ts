import { serverApiOrigin } from "./config"

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
    })
    if (!response.ok) {
      throw new Error(`GET /v1/books responded ${response.status}`)
    }
    const books = (await response.json()) as Book[]
    if (!Array.isArray(books)) {
      throw new Error("GET /v1/books did not return an array")
    }

    return books
      .filter(
        (book) =>
          typeof book?.abrv === "string" &&
          Number.isInteger(book?.chapterCount) &&
          book.chapterCount > 0,
      )
      .flatMap((book) => {
        const urlAbrv = book.abrv.replace(/\s/g, "").toLowerCase()
        return Array.from({ length: book.chapterCount }, (_, index) => ({
          book: urlAbrv,
          chapter: `${index + 1}`,
        }))
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
