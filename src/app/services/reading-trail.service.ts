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
 * A record of the way taken, not the shortest path to here: coming back to
 * somewhere already on it adds a further step rather than rewinding to the
 * earlier one, so following a reference from Matthew to Luke and back leaves
 * all three behind it. Only re-reading the chapter already open is folded
 * into the step it repeats.
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
    const last = trail[trail.length - 1]

    // The chapter already open, revisited: the same step, not a new one. Its
    // entry is replaced so a deep link's verse stays current.
    if (last?.key === entry.key) {
      this.subject.next([...trail.slice(0, -1), entry])
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
