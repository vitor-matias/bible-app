import { Injectable } from "@angular/core"
import { BehaviorSubject, map, type Observable } from "rxjs"
import { safeLocalStorage } from "../utils/web-storage"

export type VerseNote = {
  bookId: Book["id"]
  chapter: Chapter["number"]
  verse: Verse["number"]
  text: string
  updatedAt: number
}

const STORAGE_KEY = "verseNotes"

/**
 * The reader's own notes on a verse. Deliberately device-local — the app has
 * no accounts and asks for none — so this is localStorage and nothing else,
 * and a browser that refuses storage simply keeps no notes rather than
 * throwing readers out of study mode.
 *
 * Notes are keyed by book/chapter/verse and held in one JSON object: the whole
 * set is small (a reader's own annotations), and one key keeps a save
 * atomic — a half-written set can never leave a note pointing at no verse.
 */
@Injectable({ providedIn: "root" })
export class NotesService {
  private storageRef: Storage | null = null
  private readonly notesSubject = new BehaviorSubject<VerseNote[]>([])
  readonly notes$: Observable<VerseNote[]> = this.notesSubject.asObservable()

  constructor() {
    this.notesSubject.next(this.read())
  }

  /** Resolved once: the probe behind safeLocalStorage() costs a real write. */
  private get storage(): Storage | null {
    if (!this.storageRef) {
      this.storageRef = safeLocalStorage()
    }
    return this.storageRef
  }

  static keyFor(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): string {
    return `${bookId}:${chapter}:${verse}`
  }

  getNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): VerseNote | undefined {
    return this.notesSubject.value.find(
      (note) =>
        note.bookId === bookId &&
        note.chapter === chapter &&
        note.verse === verse,
    )
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

    const note: VerseNote = {
      bookId,
      chapter,
      verse,
      text: trimmed,
      updatedAt: Date.now(),
    }
    const rest = this.notesSubject.value.filter(
      (existing) =>
        !(
          existing.bookId === bookId &&
          existing.chapter === chapter &&
          existing.verse === verse
        ),
    )
    this.commit([...rest, note])
  }

  deleteNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): void {
    const remaining = this.notesSubject.value.filter(
      (note) =>
        !(
          note.bookId === bookId &&
          note.chapter === chapter &&
          note.verse === verse
        ),
    )
    if (remaining.length === this.notesSubject.value.length) return
    this.commit(remaining)
  }

  private commit(notes: VerseNote[]): void {
    this.notesSubject.next(notes)
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(notes))
    } catch {
      // Quota exhausted mid-session: the note stays in memory for this
      // session rather than taking the reader's study session down with it.
    }
  }

  /** Reads the stored set, dropping anything that is not a usable note. */
  private read(): VerseNote[] {
    const raw = this.storage?.getItem(STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(NotesService.isVerseNote)
    } catch {
      return []
    }
  }

  private static isVerseNote(value: unknown): value is VerseNote {
    if (!value || typeof value !== "object") return false
    const note = value as Partial<VerseNote>
    return (
      typeof note.bookId === "string" &&
      typeof note.chapter === "number" &&
      typeof note.verse === "number" &&
      typeof note.text === "string" &&
      note.text.length > 0
    )
  }
}
