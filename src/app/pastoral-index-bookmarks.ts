import titles from "./pastoral-index-titles.json"

/**
 * Ribbons on the Índice Bíblico-Pastoral. A bookmark stores a book and a
 * chapter, so a theme is the book "indice/<slug>" and the index itself "indice",
 * which keeps the store and the native sheets as they are. By slug, not by
 * position: a slug survives regenerating the data.
 */
const INDEX_ID = "indice"
const THEME_PREFIX = `${INDEX_ID}/`

/** The one "chapter" of a theme, as a ribbon needs one. */
export const INDEX_BOOKMARK_CHAPTER = 1

export function indexBookmarkId(slug?: string | null): string {
  return slug ? `${THEME_PREFIX}${slug}` : INDEX_ID
}

export function isIndexBookmark(bookId: string): boolean {
  return bookId === INDEX_ID || bookId.startsWith(THEME_PREFIX)
}

function slugOf(bookId: string): string | undefined {
  return bookId.startsWith(THEME_PREFIX)
    ? bookId.slice(THEME_PREFIX.length)
    : undefined
}

/** What a ribbon on the index says: the theme's title, or "Índice". */
export function indexBookmarkLabel(bookId: string): string {
  const slug = slugOf(bookId)
  const title = slug && (titles as Record<string, string>)[slug]
  return title || "Índice"
}

/** Where a ribbon on the index leads. A theme no longer there: the index. */
export function indexBookmarkLink(bookId: string): string[] {
  const slug = slugOf(bookId)
  return slug && slug in titles ? ["/indice", slug] : ["/indice"]
}
