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
  // "intro" or digits: parseChapterUrlSegment turns anything else into 1.
  if (
    chapterSegment !== BookService.INTRO_URL_SEGMENT &&
    !/^\d+$/.test(chapterSegment)
  )
    return false
  const book = books.findBook(bookSegment)
  const chapter = books.parseChapterUrlSegment(chapterSegment)
  if (book.id === "about")
    return (
      ["about", books.getUrlAbrv(book)].includes(bookSegment) && chapter === 1
    )
  // A standalone introduction has no chapters, only its own page.
  if (book.chapterCount === 0) return chapter === 0
  return chapter <= book.chapterCount
}
