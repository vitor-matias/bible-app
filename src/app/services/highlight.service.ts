import { Injectable } from "@angular/core"
import { BehaviorSubject, map, type Observable } from "rxjs"
import { safeLocalStorage } from "../utils/web-storage"

/** A colour a reader can mark a verse with, named as the panel offers it. */
export type HighlightColor = "yellow" | "green" | "blue" | "pink"

export type VerseHighlight = {
  bookId: Book["id"]
  chapter: Chapter["number"]
  verse: Verse["number"]
  color: HighlightColor
  updatedAt: number
}

const STORAGE_KEY = "verseHighlights"

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
]

/**
 * The marks a reader leaves on the text itself.
 *
 * Device-local like the notes, and written the same way — on top of what
 * storage holds rather than on top of this tab's copy — so two tabs open on
 * the same chapter cannot drop each other's marks.
 *
 * Bookmarks already exist but are a different thing: they name a chapter to
 * come back to. A highlight is on the words.
 */
@Injectable({ providedIn: "root" })
export class HighlightService {
  private storageRef: Storage | null = null
  private readonly subject = new BehaviorSubject<VerseHighlight[]>([])
  readonly highlights$: Observable<VerseHighlight[]> =
    this.subject.asObservable()

  constructor() {
    this.subject.next(this.read())
  }

  private get storage(): Storage | null {
    if (!this.storageRef) {
      this.storageRef = safeLocalStorage()
    }
    return this.storageRef
  }

  /** The colour on one verse, if any. */
  colorFor(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): HighlightColor | undefined {
    return this.subject.value.find((highlight) =>
      HighlightService.isAt(highlight, { bookId, chapter, verse }),
    )?.color
  }

  /** Every verse marked in one chapter, keyed by verse number. */
  forChapter(
    bookId: Book["id"],
    chapter: Chapter["number"],
  ): Observable<Map<Verse["number"], HighlightColor>> {
    return this.highlights$.pipe(
      map((highlights) => {
        const marks = new Map<Verse["number"], HighlightColor>()
        for (const highlight of highlights) {
          if (highlight.bookId === bookId && highlight.chapter === chapter) {
            marks.set(highlight.verse, highlight.color)
          }
        }
        return marks
      }),
    )
  }

  /**
   * Marks a verse, or clears it when the colour it already carries is chosen
   * again — the same gesture takes the mark off, so no separate eraser is
   * needed for the common case of undoing a mistake.
   */
  toggle(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
    color: HighlightColor,
  ): void {
    const target = { bookId, chapter, verse }
    if (this.colorFor(bookId, chapter, verse) === color) {
      this.clear(bookId, chapter, verse)
      return
    }
    const highlight: VerseHighlight = {
      ...target,
      color,
      updatedAt: Date.now(),
    }
    this.commit((highlights) => [
      ...highlights.filter(
        (existing) => !HighlightService.isAt(existing, target),
      ),
      highlight,
    ])
  }

  clear(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): void {
    const target = { bookId, chapter, verse }
    if (
      !this.subject.value.some((highlight) =>
        HighlightService.isAt(highlight, target),
      )
    ) {
      return
    }
    this.commit((highlights) =>
      highlights.filter(
        (highlight) => !HighlightService.isAt(highlight, target),
      ),
    )
  }

  private static isAt(
    highlight: VerseHighlight,
    target: Pick<VerseHighlight, "bookId" | "chapter" | "verse">,
  ): boolean {
    return (
      highlight.bookId === target.bookId &&
      highlight.chapter === target.chapter &&
      highlight.verse === target.verse
    )
  }

  private commit(
    change: (highlights: VerseHighlight[]) => VerseHighlight[],
  ): void {
    const next = change(this.read())
    this.subject.next(next)
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Quota exhausted mid-session: the mark stays for this session rather
      // than taking the reader's page down with it.
    }
  }

  private read(): VerseHighlight[] {
    const raw = this.storage?.getItem(STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(HighlightService.isVerseHighlight)
    } catch {
      return []
    }
  }

  private static isVerseHighlight(value: unknown): value is VerseHighlight {
    if (!value || typeof value !== "object") return false
    const highlight = value as Partial<VerseHighlight>
    return (
      typeof highlight.bookId === "string" &&
      typeof highlight.chapter === "number" &&
      typeof highlight.verse === "number" &&
      typeof highlight.updatedAt === "number" &&
      HIGHLIGHT_COLORS.includes(highlight.color as HighlightColor)
    )
  }
}
