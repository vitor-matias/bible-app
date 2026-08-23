import { Injectable } from "@angular/core"
import { BehaviorSubject, type Observable } from "rxjs"

/** One place the reader has been, and the way back to it. */
export type TrailEntry = {
  /** Identity of the place, so returning to it retraces rather than repeats. */
  key: string
  label: string
  link: (string | number)[]
  queryParams?: Record<string, number> | null
}

/**
 * How far back the trail remembers. Long enough to retrace a session's worth
 * of following references, short enough that the bar stays a bar.
 */
const MAX_ENTRIES = 20

/**
 * Where the reader has been, in the order they went.
 *
 * A trail, not a history: returning to somewhere already on it retraces to
 * that point and drops what came after, the way a breadcrumb does. That is
 * what keeps following a chain of references — and then stepping back up it —
 * from growing an ever longer list of the same few chapters.
 *
 * Kept in memory rather than in storage: it describes this session's reading,
 * and a trail restored days later would be a list of places the reader no
 * longer remembers visiting.
 */
@Injectable({ providedIn: "root" })
export class ReadingTrailService {
  private readonly subject = new BehaviorSubject<TrailEntry[]>([])
  readonly entries$: Observable<TrailEntry[]> = this.subject.asObservable()

  get entries(): TrailEntry[] {
    return this.subject.value
  }

  visit(entry: TrailEntry): void {
    const trail = this.subject.value
    const seen = trail.findIndex((existing) => existing.key === entry.key)

    // Somewhere already on the trail: cut back to it. This covers both
    // stepping back up the trail and re-reading the chapter already open,
    // whose entry is replaced so a deep link's verse stays current.
    if (seen >= 0) {
      this.subject.next([...trail.slice(0, seen), entry])
      return
    }

    const next = [...trail, entry]
    this.subject.next(
      next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next,
    )
  }

  clear(): void {
    if (!this.subject.value.length) return
    this.subject.next([])
  }
}
