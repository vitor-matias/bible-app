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
    this.otDataSource.data = this.oldTestament
    this.ntDataSource.data = this.newTestament

    this.otTreeControl.expandAll()
    this.ntTreeControl.expandAll()
  }

  hasChild = (_: number, node: ExampleFlatNode) => node.expandable

  oldTestament: CanonGroup[] = OLD_TESTAMENT_GROUPS

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
      this.otDataSource.data = this.oldTestament
      this.ntDataSource.data = this.newTestament
      this.otTreeControl.expandAll()
      this.ntTreeControl.expandAll()
      return
    }

    const filterGroup = (
      groups: typeof this.oldTestament,
    ): typeof this.oldTestament =>
      groups
        .map((group) => ({
          ...group,
          books: (group.books as string[]).filter((bookId) => {
            const book = this.getBook(bookId)
            return (
              book &&
              (this.normalizeSearchValue(book.shortName).includes(q) ||
                this.normalizeSearchValue(book.name).includes(q))
            )
          }),
        }))
        .filter((group) => group.books.length > 0)

    this.otDataSource.data = filterGroup(this.oldTestament)
    this.ntDataSource.data = filterGroup(this.newTestament)
    this.otTreeControl.expandAll()
    this.ntTreeControl.expandAll()
  }

  @Input()
  books: Book[] = []

  @Input()
  selectedBookId: string | undefined

  @Output() submitData = new EventEmitter<{ bookId: Book["id"] }>()

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
