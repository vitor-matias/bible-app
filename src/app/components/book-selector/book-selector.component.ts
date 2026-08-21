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
  OLD_TESTAMENT_GROUPS,
} from "../../bible-canon"

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
    this.buildTrees()
  }

  hasChild = (_: number, node: ExampleFlatNode) => node.expandable

  oldTestament: CanonGroup[] = OLD_TESTAMENT_GROUPS

  /**
   * The picker's own view of the canon: each group led by its standalone
   * introduction, plus a group heading each column for the introductions that
   * belong to no group (the whole Bible, the New Testament).
   *
   * Introductions are synthetic books keyed by their slug, so they need no
   * special template — they render and navigate like any other entry. Entries
   * whose introduction has not loaded (or that the API does not serve) are
   * dropped, so nothing renders blank. Built here rather than in bible-canon
   * so the crawlable book index keeps listing books only.
   */
  private withIntros(groups: CanonGroup[], leading: string[]): CanonGroup[] {
    const available = (slugs: string[]) =>
      slugs.filter((slug) => this.getBook(slug))

    const groupsWithIntros = groups.map((group) =>
      group.introSlug && available([group.introSlug]).length
        ? { ...group, books: [group.introSlug, ...group.books] }
        : group,
    )

    // Top-level entries rather than a wrapper group: a node with no children
    // renders through the leaf template, so naming it after the slug gives a
    // plain, clickable row beside the group headings.
    const leadingEntries = available(leading).map((slug) => ({
      name: slug,
      books: [] as string[],
    }))
    return [...leadingEntries, ...groupsWithIntros]
  }

  /** Rebuilds both trees; intros arrive after the books, so this re-runs. */
  private buildTrees(): void {
    this.otDataSource.data = this.withIntros(this.oldTestament, ["geral"])
    this.ntDataSource.data = this.withIntros(this.newTestament, [
      "novotestamento",
    ])
    this.otTreeControl.expandAll()
    this.ntTreeControl.expandAll()
  }

  // The picker also offers the synthetic About page, which is not part of the
  // shared canon (the crawlable book index must not link to it).
  newTestament: CanonGroup[] = [
    ...NEW_TESTAMENT_GROUPS,
    {
      name: "Sobre a Bíblia",
      books: ["about"],
    },
  ]

  filterQuery = ""

  filterBooks(query: string): void {
    this.filterQuery = query
    const q = this.normalizeSearchValue(query)
    if (!q) {
      this.buildTrees()
      return
    }

    const matchesBook = (bookId: string): boolean => {
      const book = this.getBook(bookId)
      return (
        !!book &&
        (this.normalizeSearchValue(book.shortName).includes(q) ||
          this.normalizeSearchValue(book.name).includes(q))
      )
    }

    const filterGroup = (
      groups: typeof this.oldTestament,
    ): typeof this.oldTestament =>
      groups
        .map((group) => ({
          ...group,
          books: (group.books as string[]).filter(matchesBook),
        }))
        // An introduction that belongs to no group is a childless entry named
        // after its own slug, so it is kept by its own name rather than by
        // children it will never have.
        .filter((group) => group.books.length > 0 || matchesBook(group.name))

    // Filter the same groups the picker shows, so introductions are findable
    // by name too.
    this.otDataSource.data = filterGroup(
      this.withIntros(this.oldTestament, ["geral"]),
    )
    this.ntDataSource.data = filterGroup(
      this.withIntros(this.newTestament, ["novotestamento"]),
    )
    this.otTreeControl.expandAll()
    this.ntTreeControl.expandAll()
  }

  @Input()
  books: Book[] = []

  @Input()
  selectedBookId: string | undefined

  @Output() submitData = new EventEmitter<{ bookId: Book["id"] }>()

  /**
   * Label for one entry. Every introduction reads just "Introdução": the
   * heading right above it — the testament or the group — already supplies the
   * context, so repeating it would say the same thing twice. The full name
   * stays on the book itself, for the toolbar and the page title.
   */
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

  private normalizeSearchValue(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase()
  }

  ngAfterViewInit(): void {
    // Deferred like the ngOnChanges path below: ngAfterViewInit also runs during
    // prerendering, where the server DOM has no scrollIntoView. afterNextRender
    // is browser-only, so the scroll simply doesn't happen there.
    afterNextRender(() => this.scrollToSelectedBook(), {
      injector: this.injector,
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["books"] && !this.filterQuery) {
      this.buildTrees()
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
