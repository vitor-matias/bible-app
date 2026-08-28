import { Injectable } from "@angular/core"
import { map, type Observable } from "rxjs"
import { type VerseRecord, VerseRecordStore } from "./verse-record-store"

/** A colour a reader can mark a verse with, named as the panel offers it. */
export type HighlightColor = "yellow" | "green" | "blue" | "pink"

export type VerseHighlight = VerseRecord & {
  color: HighlightColor
  updatedAt: number
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
]

/**
 * The marks a reader leaves on the text itself. Bookmarks already exist but
 * are a different thing: they name a chapter to come back to. A highlight is
 * on the words.
 */
@Injectable({ providedIn: "root" })
export class HighlightService extends VerseRecordStore<VerseHighlight> {
  readonly highlights$ = this.records$

  constructor() {
    super("verseHighlights")
  }

  /** The colour on one verse, if any. */
  colorFor(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): HighlightColor | undefined {
    return this.at({ bookId, chapter, verse })?.color
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
    if (this.colorFor(bookId, chapter, verse) === color) {
      this.clear(bookId, chapter, verse)
      return
    }
    this.put({ bookId, chapter, verse, color, updatedAt: Date.now() })
  }

  clear(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): void {
    this.removeAt({ bookId, chapter, verse })
  }

  protected isRecord(value: unknown): value is VerseHighlight {
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
