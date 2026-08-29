import { Injectable } from "@angular/core"
import { map, type Observable } from "rxjs"
import { normalizeForSearch } from "../utils/text"
import { type VerseRecord, VerseRecordStore } from "./verse-record-store"

export type VerseNote = VerseRecord & {
  text: string
  updatedAt: number
}

/**
 * The reader's own notes on a verse — device-local, no account, as the note
 * box says. The storage itself lives in VerseRecordStore; what is here is
 * what makes a note a note.
 */
@Injectable({ providedIn: "root" })
export class NotesService extends VerseRecordStore<VerseNote> {
  readonly notes$ = this.records$

  constructor() {
    super("verseNotes")
  }

  getNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): VerseNote | undefined {
    return this.at({ bookId, chapter, verse })
  }

  /** Every note in one chapter, in verse order. */
  notesForChapter(
    bookId: Book["id"],
    chapter: Chapter["number"],
  ): Observable<VerseNote[]> {
    return this.notes$.pipe(
      map((notes) =>
        notes
          .filter((note) => note.bookId === bookId && note.chapter === chapter)
          .sort((a, b) => a.verse - b.verse),
      ),
    )
  }

  /**
   * Notes whose text matches, newest first, across every book. The reader's
   * own notes become a commentary they wrote, and a commentary you cannot
   * look things up in is a commentary you do not consult.
   */
  search(query: string): Observable<VerseNote[]> {
    const needle = normalizeForSearch(query)
    return this.notes$.pipe(
      map((notes) =>
        needle
          ? notes
              .filter((note) => normalizeForSearch(note.text).includes(needle))
              .sort((a, b) => b.updatedAt - a.updatedAt)
          : [],
      ),
    )
  }

  /** Saves a note, or removes it when the reader empties the box. */
  saveNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
    text: string,
  ): void {
    const trimmed = text.trim()
    if (!trimmed) {
      this.deleteNote(bookId, chapter, verse)
      return
    }
    this.put({ bookId, chapter, verse, text: trimmed, updatedAt: Date.now() })
  }

  deleteNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): void {
    this.removeAt({ bookId, chapter, verse })
  }

  protected isRecord(value: unknown): value is VerseNote {
    if (!value || typeof value !== "object") return false
    const note = value as Partial<VerseNote>
    return (
      typeof note.bookId === "string" &&
      typeof note.chapter === "number" &&
      typeof note.verse === "number" &&
      typeof note.updatedAt === "number" &&
      typeof note.text === "string" &&
      note.text.length > 0
    )
  }
}
