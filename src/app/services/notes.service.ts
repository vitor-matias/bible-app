import { Injectable } from "@angular/core"
import { map, type Observable } from "rxjs"
import { normalizeForSearch } from "../utils/text"
import { type VerseRecord, VerseRecordStore } from "./verse-record-store"

export type VerseNote = VerseRecord & {
  text: string
  updatedAt: number
  /**
   * The last verse of a passage the note is on, when it is on more than one.
   * Not offered yet: it is here so a saved copy made today still says where a
   * note on a passage starts and ends when notes learn to span verses, and
   * the copy does not have to be rewritten.
   */
  verseEnd?: number
  /** A short name for the note, to find it by next year. */
  title?: string
}

/** Whether something read from storage, or from a saved copy, is a note. */
export function isVerseNote(value: unknown): value is VerseNote {
  if (!value || typeof value !== "object") return false
  const note = value as Partial<VerseNote>
  return (
    typeof note.bookId === "string" &&
    typeof note.chapter === "number" &&
    typeof note.verse === "number" &&
    typeof note.updatedAt === "number" &&
    typeof note.text === "string" &&
    note.text.trim().length > 0 &&
    (note.verseEnd === undefined || typeof note.verseEnd === "number") &&
    (note.title === undefined || typeof note.title === "string")
  )
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
              .filter((note) =>
                normalizeForSearch(`${note.title ?? ""} ${note.text}`).includes(
                  needle,
                ),
              )
              .sort((a, b) => b.updatedAt - a.updatedAt)
          : [],
      ),
    )
  }

  /**
   * Saves a note, or removes it when the reader empties the box. A title is
   * only ever a name for a note: with no text there is no note, whatever the
   * title says.
   */
  saveNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
    text: string,
    title = "",
  ): void {
    const trimmed = text.trim()
    if (!trimmed) {
      this.deleteNote(bookId, chapter, verse)
      return
    }
    const name = title.trim()
    // Saving what is already there — leaving the box without typing, the
    // debounce landing after a blur — must not pass for an edit: updatedAt
    // orders the reader's notes, newest first.
    const before = this.getNote(bookId, chapter, verse)
    if (before?.text === trimmed && (before.title ?? "") === name) return
    this.put({
      bookId,
      chapter,
      verse,
      text: trimmed,
      updatedAt: Date.now(),
      ...(name ? { title: name } : {}),
    })
  }

  deleteNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): void {
    this.removeAt({ bookId, chapter, verse })
  }

  /**
   * Notes from a saved copy. A note for a verse that already has one is
   * replaced only by a newer one, so an old file cannot undo later writing.
   */
  importNotes(notes: VerseNote[]): {
    added: number
    replaced: number
    kept: number
  } {
    return this.merge(notes, (incoming, existing) => {
      return incoming.updatedAt > existing.updatedAt
    })
  }

  /** Every note, gone. */
  deleteAll(): void {
    this.removeEverything()
  }

  protected isRecord(value: unknown): value is VerseNote {
    return isVerseNote(value)
  }
}
