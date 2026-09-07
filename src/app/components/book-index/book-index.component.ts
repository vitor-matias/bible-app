import { AsyncPipe } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatToolbarModule } from "@angular/material/toolbar"
import { RouterLink } from "@angular/router"
import { map } from "rxjs/operators"
import {
  type CanonGroup,
  NEW_TESTAMENT_GROUPS,
  OLD_TESTAMENT_GROUPS,
} from "../../bible-canon"
import { BookService } from "../../services/book.service"
import { SeoService } from "../../services/seo.service"

interface IndexedBook {
  name: string
  link: string[]
}

interface IndexedGroup {
  name: string
  /** Link to this group's standalone introduction, when the API has one. */
  introLink?: string[]
  books: IndexedBook[]
}

interface TestamentIndex {
  name: string
  groups: IndexedGroup[]
}

/**
 * The crawlable counterpart to the drawer's book picker: real anchors to every
 * book, grouped the way the canon groups them, on a prerendered page of its
 * own.
 *
 * It lives at /livros rather than on the About page because the point is to
 * pass internal link weight to all 73 books in one hop, and the About page is
 * prose that a wall of links does not belong on. A reader gets a table of
 * contents out of it, which is what keeps the page worth indexing on its own
 * terms rather than reading as a doorway built only for crawlers.
 */
@Component({
  selector: "book-index",
  imports: [
    AsyncPipe,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: "./book-index.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./book-index.component.css",
})
export class BookIndexComponent implements OnInit {
  private bookService = inject(BookService)
  private seoService = inject(SeoService)

  testaments$ = this.bookService.books$.pipe(
    map((books) => this.buildIndex(books)),
  )

  ngOnInit(): void {
    this.seoService.updateForBookIndex()
  }

  private buildIndex(books: Book[]): TestamentIndex[] {
    const byId = new Map(books.map((book) => [book.id, book]))
    const toGroups = (groups: CanonGroup[]): IndexedGroup[] =>
      groups.map((group) => ({
        name: group.name,
        introLink: this.introLinkFor(group, byId),
        books: group.books
          .map((id) => byId.get(id))
          // bible-canon.ts holds the 73 canonical books only — the synthetic
          // About and introduction entries are appended by BookService, never
          // by the canon — so an unknown id here just means the API did not
          // return that book.
          .filter((book): book is Book => !!book)
          .map((book) => ({
            name: book.name,
            link: ["/", this.bookService.getUrlAbrv(book), "1"],
          })),
      }))
    return [
      { name: "Antigo Testamento", groups: toGroups(OLD_TESTAMENT_GROUPS) },
      { name: "Novo Testamento", groups: toGroups(NEW_TESTAMENT_GROUPS) },
    ]
  }

  /**
   * Standalone group introductions are pages in their own right, so link them
   * too — but only once BookService has actually seen the slug, so a build
   * without them does not emit links to pages that were never prerendered.
   */
  private introLinkFor(
    group: CanonGroup,
    byId: Map<string, Book>,
  ): string[] | undefined {
    if (!group.introSlug) return undefined
    const intro = byId.get(group.introSlug)
    return intro
      ? ["/", this.bookService.getUrlAbrv(intro), BookService.INTRO_URL_SEGMENT]
      : undefined
  }
}
