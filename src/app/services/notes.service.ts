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
    this.commit((notes) => [
      ...notes.filter((existing) => !NotesService.isAt(existing, note)),
      note,
    ])
  }

  deleteNote(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): void {
    const target = { bookId, chapter, verse }
    if (
      !this.notesSubject.value.some((note) => NotesService.isAt(note, target))
    )
      return
    this.commit((notes) =>
      notes.filter((note) => !NotesService.isAt(note, target)),
    )
  }

  private static isAt(
    note: VerseNote,
    target: Pick<VerseNote, "bookId" | "chapter" | "verse">,
  ): boolean {
    return (
      note.bookId === target.bookId &&
      note.chapter === target.chapter &&
      note.verse === target.verse
    )
  }

  /**
   * Applies a change on top of what storage holds right now, not on top of
   * what this tab last read. Two tabs open on the same chapter would
   * otherwise each write their whole in-memory list back, and the slower one
   * would silently drop the other's notes.
   */
  private commit(change: (notes: VerseNote[]) => VerseNote[]): void {
    const next = change(this.read())
    this.notesSubject.next(next)
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(next))
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
      typeof note.updatedAt === "number" &&
      typeof note.text === "string" &&
      note.text.length > 0
    )
  }
}
