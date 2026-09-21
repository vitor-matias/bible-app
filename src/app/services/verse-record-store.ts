import { DestroyRef, inject } from "@angular/core"
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
  private storageRef: Storage | null | undefined
  /**
   * Set while storage does not hold what this tab last wrote — it refused the
   * write, or there is no storage at all. The tab's own copy is then the only
   * complete one, and the next write has to build on it.
   */
  private unsaved = false
  private readonly subject = new BehaviorSubject<T[]>([])
  readonly records$: Observable<T[]> = this.subject.asObservable()

  protected constructor(private readonly storageKey: string) {
    this.subject.next(this.read())
    if (typeof window !== "undefined") {
      // Another tab wrote: follow it, so a verse annotated there does not
      // show an empty box here for the reader to overwrite it from.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== this.storageKey) return
        if (!this.unsaved) this.subject.next(this.read())
      }
      window.addEventListener("storage", onStorage)
      inject(DestroyRef).onDestroy(() =>
        window.removeEventListener("storage", onStorage),
      )
    }
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
    // Storage is the base only while it holds everything this tab wrote.
    // Once a write has been refused it is behind, and building on it would
    // drop the very records that were kept for the session.
    const next = change(this.unsaved ? this.records : this.read())
    this.subject.next(next)
    const storage = this.storage
    if (!storage) {
      this.unsaved = true
      return
    }
    try {
      storage.setItem(this.storageKey, JSON.stringify(next))
      this.unsaved = false
    } catch {
      // Quota exhausted mid-session: what the reader just wrote stays for
      // this session rather than taking the page down with it.
      this.unsaved = true
    }
  }

  private read(): T[] {
    try {
      // Inside the try as well: safeLocalStorage() probes once, and a storage
      // that passed can still refuse a later read (quota, a revoked
      // permission, private browsing).
      const raw = this.storage?.getItem(this.storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((value): value is T => this.isRecord(value))
    } catch {
      return []
    }
  }

  /** Resolved once: the probe behind safeLocalStorage() costs a real write. */
  private get storage(): Storage | null {
    if (this.storageRef === undefined) {
      this.storageRef = safeLocalStorage()
    }
    return this.storageRef
  }
}
