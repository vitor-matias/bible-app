import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
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

  groups: SidebarGroup[] = []
  /** Name of the one expanded group, or "" when the reader closed them all. */
  expandedGroup = ""

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["books"]) {
      this.groups = this.buildGroups()
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

  isExpanded(group: SidebarGroup): boolean {
    return this.expandedGroup === group.name
  }

  toggleGroup(group: SidebarGroup): void {
    this.expandedGroup = this.isExpanded(group) ? "" : group.name
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
   * The canon, filtered down to the books this edition actually serves.
   * Standalone introductions are left out: they are reachable from each
   * book's own chapter list, and listing them here would double every group.
   */
  private buildGroups(): SidebarGroup[] {
    const byId = new Map(this.books.map((book) => [book.id, book]))
    const canon: CanonGroup[] = [
      ...OLD_TESTAMENT_GROUPS,
      ...NEW_TESTAMENT_GROUPS,
    ]
    return canon
      .map((group) => ({
        name: group.name,
        books: group.books
          .map((id) => byId.get(id))
          .filter((book): book is Book => !!book),
      }))
      .filter((group) => group.books.length > 0)
  }
}
