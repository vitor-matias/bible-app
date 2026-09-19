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
 * Crawlable counterpart to the drawer's book picker: a prerendered page with
 * real anchors to every book, grouped as the canon groups them.
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
          // An unknown id means the API did not return that book.
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
   * Links a group's introduction only once BookService has loaded it, so a
   * build without it emits no link to a page that was never prerendered.
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
