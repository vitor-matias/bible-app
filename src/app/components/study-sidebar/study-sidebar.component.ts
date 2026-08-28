import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  inject,
  type OnChanges,
  Output,
  type SimpleChanges,
} from "@angular/core"
import { MatIconModule } from "@angular/material/icon"
import { MatTooltipModule } from "@angular/material/tooltip"
import {
  type CanonGroup,
  NEW_TESTAMENT_GROUPS,
  OLD_TESTAMENT_GROUPS,
} from "../../bible-canon"
import { normalizeForSearch } from "../../utils/text"

/** One canon group as the sidebar shows it: only the books actually served. */
type SidebarGroup = {
  name: string
  books: Book[]
}

/**
 * Study mode's permanent left rail: the books around the one being read, and
 * every chapter of it.
 *
 * It replaces the drawer rather than reusing the book/chapter selectors,
 * because those are built for a full-width overlay a reader dismisses — this
 * one stays on screen beside the text and has to stay narrow and quiet. It
 * opens on the group holding the current book and keeps the rest collapsed,
 * so the whole canon is one click away without 73 rows between the reader and
 * the chapter list.
 */
@Component({
  selector: "study-sidebar",
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: "./study-sidebar.component.html",
  styleUrl: "./study-sidebar.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudySidebarComponent implements OnChanges {
  @Input() books: Book[] = []
  @Input() book?: Book
  /** The book's chapters, introduction included, as the reader lists them. */
  @Input() chapters: Chapter[] = []
  @Input() selectedChapter: Chapter["number"] = 1
  /** Folded away to a strip, leaving the reading column the width. */
  @Input() collapsed = false

  @Output() selectBook = new EventEmitter<{ bookId: Book["id"] }>()
  @Output() selectChapter = new EventEmitter<{
    chapterNumber: Chapter["number"]
  }>()
  @Output() toggleCollapsed = new EventEmitter<void>()

  private readonly cdr = inject(ChangeDetectorRef)

  groups: SidebarGroup[] = []
  /**
   * Introductions belonging to no single group — the whole Bible, a testament
   * — which have nowhere else to appear.
   */
  standaloneIntros: Book[] = []
  /** What the reader has typed into the filter, if anything. */
  filter = ""
  /** Books matching the filter, flattened out of their groups. */
  matches: Book[] = []
  /** Name of the one expanded group, or "" when the reader closed them all. */
  expandedGroup = ""

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["books"]) {
      this.groups = this.buildGroups()
      // An introduction loading pushes a new book list; a filter already
      // typed must be re-run against it rather than showing the old matches.
      if (this.filtering) this.onFilter(this.filter)
    }
    // Follow the reader: navigating to another group (from a reference, the
    // search page, a deep link) opens the group they landed in. A group the
    // reader collapsed by hand stays collapsed until they move books — which
    // is why only a real change of book re-expands. The book list changes on
    // its own when an introduction loads, and that must not reopen anything.
    const bookChange = changes["book"]
    if (bookChange && bookChange.previousValue?.id !== this.book?.id) {
      const owning = this.groupOf(this.book?.id)
      if (owning) this.expandedGroup = owning
    }
  }

  get filtering(): boolean {
    return this.filter.trim().length > 0
  }

  /**
   * Filtering flattens the canon: a reader typing a name wants that book,
   * not the group it happens to belong to, and having to notice which group
   * a match sits in would put the structure back in the way.
   */
  onFilter(query: string): void {
    this.filter = query
    const needle = normalizeForSearch(query)
    this.matches = needle
      ? this.groups
          .flatMap((group) => group.books)
          .filter(
            (book) =>
              normalizeForSearch(book.shortName).includes(needle) ||
              normalizeForSearch(book.name).includes(needle),
          )
      : []
    this.cdr.detectChanges()
  }

  clearFilter(): void {
    this.onFilter("")
  }

  isExpanded(group: SidebarGroup): boolean {
    return this.expandedGroup === group.name
  }

  toggleGroup(group: SidebarGroup): void {
    this.expandedGroup = this.isExpanded(group) ? "" : group.name
    // Rendered here for the same reason the study panel's tabs are: opening
    // a group is the whole interaction, with nothing following it to flush a
    // coalesced change detection pass.
    this.cdr.detectChanges()
  }

  /**
   * What a row says. An introduction inside a group reads just "Introdução":
   * the heading above it already names what it introduces, and repeating that
   * would say the same thing twice. The wider ones keep their own names,
   * having no heading to lean on.
   */
  entryLabel(entry: Book): string {
    return entry.introSlug ? "Introdução" : entry.shortName
  }

  /** An introduction has no chapters to count. */
  chapterCountFor(entry: Book): string {
    return entry.introSlug ? "" : String(entry.chapterCount)
  }

  onBookClick(book: Book): void {
    this.selectBook.emit({ bookId: book.id })
  }

  onChapterClick(chapter: Chapter): void {
    this.selectChapter.emit({ chapterNumber: chapter.number })
  }

  /** Chapter 0 is the introduction, which has a name instead of a number. */
  chapterLabel(chapter: Chapter): string {
    return chapter.number === 0 ? "Intro" : chapter.number.toString()
  }

  chapterAriaLabel(chapter: Chapter): string {
    return chapter.number === 0 ? "Introdução" : `Capítulo ${chapter.number}`
  }

  private groupOf(bookId: Book["id"] | undefined): string | undefined {
    if (!bookId) return undefined
    return this.groups.find((group) =>
      group.books.some((book) => book.id === bookId),
    )?.name
  }

  /**
   * The canon, filtered down to the books this edition actually serves, each
   * group led by its own introduction.
   *
   * The introductions have to be listed: only a book's *shared* introduction
   * is reachable from its chapter list, so leaving them out put the ones
   * written for a group, a testament or the whole Bible out of reach in study
   * mode entirely.
   */
  private buildGroups(): SidebarGroup[] {
    const byId = new Map(this.books.map((book) => [book.id, book]))
    const canon: CanonGroup[] = [
      ...OLD_TESTAMENT_GROUPS,
      ...NEW_TESTAMENT_GROUPS,
    ]

    const grouped = canon
      .map((group) => {
        const intro = group.introSlug ? byId.get(group.introSlug) : undefined
        const books = group.books
          .map((id) => byId.get(id))
          .filter((book): book is Book => !!book)
        return {
          name: group.name,
          books: intro ? [intro, ...books] : books,
        }
      })
      .filter((group) => group.books.length > 0)

    // What is left introduces something wider than any one group: the whole
    // Bible, a testament. An introduction written for a cluster of books
    // (Samuel, Reis, …) is already reachable from each of their chapter
    // lists, so listing it here would say it twice.
    const claimed = new Set<string>()
    for (const group of canon) {
      if (group.introSlug) claimed.add(group.introSlug)
    }
    for (const book of this.books) {
      if (book.sharedIntroSlug) claimed.add(book.sharedIntroSlug)
    }
    this.standaloneIntros = this.books.filter(
      (book) => book.introSlug && !claimed.has(book.introSlug),
    )

    return grouped
  }
}
