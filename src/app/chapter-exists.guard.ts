import { inject } from "@angular/core"
import type { CanMatchFn, UrlSegment } from "@angular/router"
import { BookService } from "./services/book.service"

/**
 * Lets `/:book/:chapter` through only for a real book and a chapter inside it,
 * so a bad link reaches the not-found page, not the About page. If the books
 * cannot load (offline, first visit), the reader decides, as before.
 */
export const chapterExists: CanMatchFn = async (
  _route,
  segments: UrlSegment[],
) => {
  const books = inject(BookService)
  try {
    await books.initializeBooks()
  } catch {
    return true
  }
  const [bookSegment, chapterSegment] = segments.map((s) => s.path)
  const book = books.findBook(bookSegment)
  if (book.id === "about") return bookSegment === books.getUrlAbrv(book)
  const chapter = books.parseChapterUrlSegment(chapterSegment)
  // Introductions have no chapters to count.
  return book.chapterCount === 0 || chapter <= book.chapterCount
}
