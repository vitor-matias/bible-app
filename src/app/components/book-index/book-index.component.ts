import { AsyncPipe } from "@angular/common"
import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { RouterLink } from "@angular/router"
import { map } from "rxjs/operators"
import {
  type CanonGroup,
  NEW_TESTAMENT_GROUPS,
  OLD_TESTAMENT_GROUPS,
} from "../../bible-canon"
import { BookService } from "../../services/book.service"

interface TestamentIndex {
  name: string
  books: { name: string; link: string[] }[]
}

/**
 * Plain list of links to the first chapter of every book, grouped by
 * testament. This is the crawlable counterpart to the drawer's book picker:
 * real anchors with the full book names, rendered into the prerendered home
 * page, so search engines can reach the whole Bible by following links
 * instead of relying on the sitemap alone.
 */
@Component({
  selector: "book-index",
  imports: [AsyncPipe, RouterLink],
  templateUrl: "./book-index.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./book-index.component.css",
})
export class BookIndexComponent {
  private bookService = inject(BookService)

  testaments$ = this.bookService.books$.pipe(
    map((books) => this.buildIndex(books)),
  )

  private buildIndex(books: Book[]): TestamentIndex[] {
    const byId = new Map(books.map((book) => [book.id, book]))
    const collect = (groups: CanonGroup[]) =>
      groups
        .flatMap((group) => group.books)
        .map((id) => byId.get(id))
        .filter((book): book is Book => !!book && book.id !== "about")
        .map((book) => ({
          name: book.name,
          link: ["/", this.bookService.getUrlAbrv(book), "1"],
        }))
    return [
      { name: "Antigo Testamento", books: collect(OLD_TESTAMENT_GROUPS) },
      { name: "Novo Testamento", books: collect(NEW_TESTAMENT_GROUPS) },
    ]
  }
}
