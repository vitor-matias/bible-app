import { BehaviorSubject, type Observable } from "rxjs"
import { safeLocalStorage } from "../utils/web-storage"

/** Anything the reader leaves on a verse: a note, a mark. */
export type VerseRecord = {
  bookId: Book["id"]
  chapter: Chapter["number"]
  verse: Verse["number"]
}

/** The three fields that say which verse a record belongs to. */
export type VerseAddress = Pick<VerseRecord, "bookId" | "chapter" | "verse">

/**
 * Storage for things a reader marks a verse with.
 *
 * Device-local by design — the app has no accounts and asks for none — so
 * this is localStorage and nothing else, and a browser that refuses storage
 * simply keeps nothing rather than throwing the reader out of the page.
 *
 * The whole set lives under one key: it is small, being one reader's own
 * annotations, and one key keeps a save atomic. Writes apply on top of what
 * storage holds rather than on top of this tab's copy, so two tabs open on
 * the same chapter cannot drop each other's work.
 *
 * Extracted because the notes and the highlights had all of this each, which
 * meant fixing the cross-tab write in one and not the other was a live
 * possibility.
 */
export abstract class VerseRecordStore<T extends VerseRecord> {
  private storageRef: Storage | null = null
  private readonly subject = new BehaviorSubject<T[]>([])
  readonly records$: Observable<T[]> = this.subject.asObservable()

  protected constructor(private readonly storageKey: string) {
    this.subject.next(this.read())
  }

  /** Whether a stored value is one of these records, or leftover rubbish. */
  protected abstract isRecord(value: unknown): value is T

  protected get records(): T[] {
    return this.subject.value
  }

  /** The record on one verse, if there is one. */
  protected at(address: VerseAddress): T | undefined {
    return this.records.find((record) => VerseRecordStore.isAt(record, address))
  }

  /** Writes a record, replacing whatever was on that verse. */
  protected put(record: T): void {
    this.commit((records) => [
      ...records.filter((existing) => !VerseRecordStore.isAt(existing, record)),
      record,
    ])
  }

  /** Removes the record on a verse, if there is one. */
  protected removeAt(address: VerseAddress): void {
    if (!this.at(address)) return
    this.commit((records) =>
      records.filter((record) => !VerseRecordStore.isAt(record, address)),
    )
  }

  protected static isAt(record: VerseRecord, address: VerseAddress): boolean {
    return (
      record.bookId === address.bookId &&
      record.chapter === address.chapter &&
      record.verse === address.verse
    )
  }

  private commit(change: (records: T[]) => T[]): void {
    const next = change(this.read())
    this.subject.next(next)
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(next))
    } catch {
      // Quota exhausted mid-session: what the reader just wrote stays for
      // this session rather than taking the page down with it.
    }
  }

  private read(): T[] {
    const raw = this.storage?.getItem(this.storageKey)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((value): value is T => this.isRecord(value))
    } catch {
      return []
    }
  }

  /** Resolved once: the probe behind safeLocalStorage() costs a real write. */
  private get storage(): Storage | null {
    if (!this.storageRef) {
      this.storageRef = safeLocalStorage()
    }
    return this.storageRef
  }
}
