import { DestroyRef, inject } from "@angular/core"
import { BehaviorSubject, type Observable } from "rxjs"
import { safeLocalStorage } from "../utils/web-storage"

/**
 * Asks the browser not to clear what the reader has written when it is short
 * of space. Quietly: it is a request the browser is free to refuse (Safari
 * does, for a site that is not installed), so nothing in the app may say the
 * notes are protected. A file the reader saved is the only copy that is.
 */
function askToKeepStorage(): void {
  if (typeof navigator === "undefined") return
  try {
    void Promise.resolve(navigator.storage?.persist?.()).catch(() => {})
  } catch {
    // No storage manager, or it threw: nothing to ask.
  }
}

/** Anything the reader leaves on a verse: a note, a mark. */
export type VerseRecord = {
  bookId: Book["id"]
  chapter: Chapter["number"]
  verse: Verse["number"]
}

/** The three fields that say which verse a record belongs to. */
export type VerseAddress = Pick<VerseRecord, "bookId" | "chapter" | "verse">

/**
 * Whether something read from storage or from a saved copy names a place a
 * verse can be: a book, a chapter (0 is a book's introduction) and a verse from
 * 1 (0 is the chapter's front matter, which nothing is written on). A record
 * anywhere else could not be found in the reader, so it could never be
 * deleted one by one, and every later copy would carry it.
 */
export function isVerseAddress(record: {
  bookId?: unknown
  chapter?: unknown
  verse?: unknown
}): boolean {
  return (
    typeof record.bookId === "string" &&
    record.bookId.length > 0 &&
    Number.isSafeInteger(record.chapter) &&
    (record.chapter as number) >= 0 &&
    Number.isSafeInteger(record.verse) &&
    (record.verse as number) >= 1
  )
}

/**
 * Storage for things a reader marks a verse with.
 *
 * Device-local by design — the app has no accounts and asks for none — so
 * this is localStorage and nothing else, and a browser that refuses storage
 * simply keeps nothing rather than throwing the reader out of the page.
 *
 * The whole set lives under one key: it is small, being one reader's own
 * annotations, and one key keeps the set consistent — a save never leaves
 * half of it behind. Writes apply on top of what storage holds rather than on
 * top of this tab's copy, so a tab left open for an hour cannot put its stale
 * list back over what another tab has written since — nor can one whose own
 * write was refused: it lays only what it changed over what storage holds. Two writes that
 * interleave inside the same instant can still lose one, which localStorage
 * gives no way to prevent short of a key per verse; a reader annotating the
 * same verse from two tabs in the same millisecond is the only one who would
 * see it.
 *
 * Extracted because the notes and the highlights had all of this each, which
 * meant fixing the cross-tab write in one and not the other was a live
 * possibility.
 */
export abstract class VerseRecordStore<T extends VerseRecord> {
  private storageRef: Storage | null | undefined
  /**
   * What this tab has changed that storage does not hold, by verse: the record
   * it wrote, or null where it took one away. Laid over whatever storage holds
   * at the next read and write, so a write the browser refused is kept for the
   * session without the tab's whole copy going back over what another tab has
   * written since.
   */
  private readonly unsavedChanges = new Map<string, T | null>()
  /** Asked once per page: the answer does not change with every note. */
  private askedToKeep = false
  private readonly saveFailedSubject = new BehaviorSubject(false)
  private readonly subject = new BehaviorSubject<T[]>([])
  readonly records$: Observable<T[]> = this.subject.asObservable()
  /**
   * True while the browser is refusing to keep what the reader writes — full,
   * private browsing, storage turned off — so it lives in this page and will
   * be gone when it closes. The note box says "fica no dispositivo", which is
   * not true then, and a reader cannot tell unless something says so.
   */
  readonly saveFailed$: Observable<boolean> =
    this.saveFailedSubject.asObservable()

  get saveFailed(): boolean {
    return this.saveFailedSubject.value
  }

  protected constructor(private readonly storageKey: string) {
    this.subject.next(this.read())
    if (typeof window !== "undefined") {
      // Another tab wrote: follow it, so a verse annotated there does not
      // show an empty box here for the reader to overwrite it from.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== this.storageKey) return
        this.subject.next(this.current())
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

  /**
   * Brings records in from a saved copy, in one write. A record for a verse
   * that already has one replaces it only when `wins` says the incoming one
   * should: a copy older than what is here must not take back later work.
   */
  protected merge(
    incoming: T[],
    wins: (incoming: T, existing: T) => boolean,
  ): { added: number; replaced: number; kept: number } {
    const result = { added: 0, replaced: 0, kept: 0 }
    this.commit((records) => {
      const next = [...records]
      for (const record of incoming) {
        const at = next.findIndex((existing) =>
          VerseRecordStore.isAt(existing, record),
        )
        if (at === -1) {
          next.push(record)
          result.added++
        } else if (wins(record, next[at])) {
          next[at] = record
          result.replaced++
        } else {
          result.kept++
        }
      }
      return next
    })
    return result
  }

  /** Removes every record. */
  protected removeEverything(): void {
    this.commit(() => [])
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
    // Built on what storage holds now, with this tab's unsaved changes over
    // it, so a tab left open does not put its stale list back, whether or not
    // an earlier write was refused. Read and write stay in one task, with
    // nothing awaited between them, which is as close to a critical section
    // as localStorage allows.
    const before = this.current()
    const next = change(before)
    this.subject.next(next)
    const storage = this.storage
    if (!storage) {
      this.keepUnsaved(before, next)
      return
    }
    try {
      storage.setItem(this.storageKey, JSON.stringify(next))
    } catch {
      // Quota exhausted mid-session: what the reader just wrote stays for
      // this session rather than taking the page down with it.
      this.keepUnsaved(before, next)
      return
    }
    this.unsavedChanges.clear()
    this.setUnsaved(false)
    if (!this.askedToKeep) {
      this.askedToKeep = true
      askToKeepStorage()
    }
  }

  /** Remembers what a refused write changed, to lay over storage next time. */
  private keepUnsaved(before: T[], next: T[]): void {
    const was = new Map(before.map((r) => [VerseRecordStore.keyOf(r), r]))
    const is = new Map(next.map((r) => [VerseRecordStore.keyOf(r), r]))
    for (const [key, record] of is) {
      if (was.get(key) !== record) this.unsavedChanges.set(key, record)
    }
    for (const key of was.keys()) {
      if (!is.has(key)) this.unsavedChanges.set(key, null)
    }
    this.setUnsaved(true)
  }

  private static keyOf(address: VerseAddress): string {
    return `${address.bookId}:${address.chapter}:${address.verse}`
  }

  /** What is stored, with this tab's unsaved changes over it. */
  private current(): T[] {
    const stored = this.read()
    if (!this.unsavedChanges.size) return stored
    const next = stored.filter(
      (record) => !this.unsavedChanges.has(VerseRecordStore.keyOf(record)),
    )
    for (const record of this.unsavedChanges.values()) {
      if (record) next.push(record)
    }
    return next
  }

  private setUnsaved(unsaved: boolean): void {
    if (this.saveFailedSubject.value !== unsaved) {
      this.saveFailedSubject.next(unsaved)
    }
  }

  private read(): T[] {
    try {
      // Not through the write probe's verdict: that probe writes, and a full
      // storage refuses it while still holding, and willing to give up, every
      // note the reader has made. A read that fails does so here.
      const raw =
        typeof localStorage === "undefined"
          ? null
          : localStorage.getItem(this.storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((value): value is T => this.isRecord(value))
    } catch {
      return []
    }
  }

  /**
   * For writes. Kept once found: the probe behind safeLocalStorage() costs a
   * real write. A failed probe is asked again, as a full storage may have room
   * again once the reader deletes something.
   */
  private get storage(): Storage | null {
    this.storageRef ??= safeLocalStorage()
    return this.storageRef
  }
}
