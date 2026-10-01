import { FlatTreeControl } from "@angular/cdk/tree"
import {
  AfterViewInit,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  Input,
  inject,
  OnChanges,
  Output,
  SimpleChanges,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatListModule } from "@angular/material/list"
import {
  MatTreeFlatDataSource,
  MatTreeFlattener,
  MatTreeModule,
} from "@angular/material/tree"
import {
  type CanonGroup,
  NEW_TESTAMENT_GROUPS,
  NEW_TESTAMENT_INTRO,
  OLD_TESTAMENT_GROUPS,
  WHOLE_BIBLE_INTRO,
} from "../../bible-canon"
import { normalizeForSearch } from "../../utils/text"

interface BookNode {
  name: string
  books?: BookNode[] | string[]
  /** Present on canon groups that have a standalone introduction. */
  introSlug?: string
}

interface ExampleFlatNode {
  expandable: boolean
  name: string
  level: number
}

@Component({
  selector: "book-selector",
  imports: [MatListModule, MatTreeModule, MatIconModule, MatButtonModule],
  templateUrl: "./book-selector.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./book-selector.component.css",
})
export class BookSelectorComponent implements AfterViewInit, OnChanges {
  private _transformer = (node: BookNode | string, level: number) => {
    return {
      expandable:
        typeof node !== "string" && !!node.books && node.books.length > 0,
      name: typeof node !== "string" ? node.name : node,
      level: level,
    }
  }

  ntTreeControl = new FlatTreeControl<ExampleFlatNode>(
    (node) => node.level,
    (node) => node.expandable,
  )

  otTreeControl = new FlatTreeControl<ExampleFlatNode>(
    (node) => node.level,
    (node) => node.expandable,
  )

  otTreeFlattener = new MatTreeFlattener(
    this._transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => (typeof node !== "string" ? node.books : null),
  )

  ntTreeFlattener = new MatTreeFlattener(
    this._transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => (typeof node !== "string" ? node.books : null),
  )

  otDataSource = new MatTreeFlatDataSource(
    this.otTreeControl,
    this.otTreeFlattener,
  )
  ntDataSource = new MatTreeFlatDataSource(
    this.ntTreeControl,
    this.ntTreeFlattener,
  )

  private injector = inject(Injector)

  constructor(private elementRef: ElementRef) {
    this.filterBooks("")
  }

  hasChild = (_: number, node: ExampleFlatNode) => node.expandable

  oldTestament: CanonGroup[] = OLD_TESTAMENT_GROUPS

  /**
   * Prepends each group's introduction, plus the ungrouped `leading` one.
   * Introductions that have not loaded are dropped, so nothing renders blank.
   */
  private withIntros(groups: CanonGroup[], leading: string): CanonGroup[] {
    const groupsWithIntros = groups.map((group) =>
      group.introSlug && this.getBook(group.introSlug)
        ? { ...group, books: [group.introSlug, ...group.books] }
        : group,
    )

    // A childless node renders through the leaf template, so it is named
    // after the slug it navigates to.
    return this.getBook(leading)
      ? [{ name: leading, books: [] }, ...groupsWithIntros]
      : groupsWithIntros
  }

  // The About page is not in the shared canon: the crawlable book index must
  // not link to it.
  newTestament: CanonGroup[] = [
    ...NEW_TESTAMENT_GROUPS,
    {
      name: "Sobre a Bíblia",
      books: ["about"],
    },
  ]

  filterQuery = ""

  /** Rebuilds both trees; intros arrive after the books, so this re-runs. */
  filterBooks(query: string): void {
    this.filterQuery = query
    const q = normalizeForSearch(query)

    const matchesBook = (bookId: string): boolean => {
      const book = this.getBook(bookId)
      return (
        !!book &&
        (normalizeForSearch(book.shortName).includes(q) ||
          normalizeForSearch(book.name).includes(q))
      )
    }

    const filterGroup = (groups: CanonGroup[]): CanonGroup[] => {
      if (!q) return groups
      return (
        groups
          .map((group) => ({
            ...group,
            books: (group.books as string[]).filter(matchesBook),
          }))
          // Ungrouped introductions are childless, so match them by name.
          .filter((group) => group.books.length > 0 || matchesBook(group.name))
      )
    }

    this.otDataSource.data = filterGroup(
      this.withIntros(this.oldTestament, WHOLE_BIBLE_INTRO),
    )
    this.ntDataSource.data = filterGroup(
      this.withIntros(this.newTestament, NEW_TESTAMENT_INTRO),
    )
    this.otTreeControl.expandAll()
    this.ntTreeControl.expandAll()
  }

  @Input()
  books: Book[] = []

  @Input()
  selectedBookId: string | undefined

  @Output() submitData = new EventEmitter<{ bookId: Book["id"] }>()

  /** Introductions read just "Introdução": the heading above gives the context. */
  entryLabel(bookId: string): string {
    const book = this.getBook(bookId)
    if (!book) return ""
    return book.introSlug ? "Introdução" : book.shortName
  }

  getBook(bookId: string): Book | undefined {
    return this.books.find((book) => book.id === bookId)
  }

  submit(id: Book["id"]) {
    this.submitData.emit({ bookId: id })
  }

  onKeyPress(event: KeyboardEvent, id: Book["id"]): void {
    this.submit(id)
  }

  ngAfterViewInit(): void {
    // Runs while prerendering too, where the DOM has no scrollIntoView;
    // afterNextRender is browser-only.
    afterNextRender(() => this.scrollToSelectedBook(), {
      injector: this.injector,
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["books"]) {
      this.filterBooks(this.filterQuery)
    }
    if (changes["selectedBookId"] && !changes["selectedBookId"].firstChange) {
      // Scroll once the updated book list has actually been rendered.
      afterNextRender(() => this.scrollToSelectedBook(), {
        injector: this.injector,
      })
    }
  }

  private scrollToSelectedBook(): void {
    if (!this.selectedBookId) return

    // Find element with data-book-id
    const element = this.elementRef.nativeElement.querySelector(
      `[data-book-id="${this.selectedBookId}"]`,
    )

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }
}
