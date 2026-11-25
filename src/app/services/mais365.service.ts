import { HttpClient } from "@angular/common/http"
import {
  computed,
  effect,
  Injectable,
  inject,
  signal,
  untracked,
} from "@angular/core"
import { rxResource } from "@angular/core/rxjs-interop"
import { Router } from "@angular/router"
import { firstValueFrom, map } from "rxjs"
import { apiBaseUrl } from "../config"
import { AnalyticsService } from "./analytics.service"
import { BookService } from "./book.service"
import {
  type ChapterEpisode,
  PodcastPlayerService,
} from "./podcast-player.service"

/** One of a +365 day's readings: a chapter, and its part of the episode. */
export interface PlanReading {
  bookId: string
  bookName: string
  chapter: number
  /** [first, last] verse, when only part of the chapter is read (Provérbios 1,1-7). */
  range?: [number, number]
  episode: ChapterEpisode
}

/** "Génesis 12", or "Provérbios 1,1-7" for part of a chapter. */
export const readingLabel = ({ bookName, chapter, range }: PlanReading) =>
  range
    ? `${bookName} ${chapter},${range[0]}${range[1] === range[0] ? "" : `-${range[1]}`}`
    : `${bookName} ${chapter}`

/** A day of +365: its episode's readings, then its reflection. */
export interface PlanDay {
  day: number
  title: string
  theme: string
  /** Who leads it, as the episode's description names them. */
  priest?: string
  url: string
  /** The episode's length, seconds. */
  duration: number
  readings: PlanReading[]
  /**
   * Where the reflection starts: the last reading's end. An introduction
   * (Dia 0 and the like) has no readings: all of it is "reflection".
   */
  reflection: number
}

const DONE_KEY = "mais365Done"

/**
 * +365 as a way through the Bible a day at a time, at the reader's own
 * pace: today is the first day not done yet. A day played as a session goes
 * through its readings on its own (the reader turning to each chapter as
 * the podcast reaches it), then to its reflection; the day is done once
 * its readings have been heard, or when the reader marks it.
 */
@Injectable({ providedIn: "root" })
export class Mais365Service {
  private readonly player = inject(PodcastPlayerService)
  private readonly router = inject(Router)
  private readonly books = inject(BookService)
  private readonly http = inject(HttpClient)
  private readonly analytics = inject(AnalyticsService)

  /**
   * A reading's address as the reader has it (/gn/1, not /gen/1): no redirect
   * on the way, which would also take down a way back shown for it.
   */
  link(reading: PlanReading): (string | number)[] {
    const book = this.books.findBookById(reading.bookId)
    const abrv = book ? this.books.getUrlAbrv(book) : reading.bookId
    return ["/", abrv, reading.chapter]
  }

  /**
   * A reading from part of a chapter (Provérbios 1,8-19) opens at its first
   * verse, not the chapter's top; unmarked, as the read-along marks it.
   */
  query(reading: PlanReading): { verseStart: number; highlight: false } | null {
    return reading.range
      ? { verseStart: reading.range[0], highlight: false }
      : null
  }

  /** Turns the reader to a reading, at its first verse. */
  private open(reading: PlanReading): void {
    const queryParams = this.query(reading)
    void (queryParams
      ? this.router.navigate(this.link(reading), { queryParams })
      : this.router.navigate(this.link(reading)))
  }

  /** Asked for by the plan's page: every reader page has this service. */
  private readonly wanted = signal(false)
  /**
   * The days from bible-api (the introductions after the day they came out
   * with), light: without verse timings, which start() fetches for its day.
   */
  readonly plan = rxResource({
    params: () => (this.wanted() ? true : undefined),
    stream: () =>
      this.http
        .get<{ days: PlanDay[] }>(`${apiBaseUrl}/mais365`)
        .pipe(map(({ days }) => days)),
  })
  // value() throws while the list failed: none, so the page can offer a retry.
  readonly days = computed(() =>
    this.plan.hasValue() ? this.plan.value() : [],
  )
  readonly done = signal<number[]>(this.storedDone())
  readonly today = computed(
    (): PlanDay | undefined =>
      this.days().find((day) => !this.done().includes(day.day)) ??
      this.days().at(-1),
  )

  /** Loads the days, once. */
  load(): void {
    this.wanted.set(true)
  }

  /** The day being played through, if any. */
  readonly active = signal<PlanDay | null>(null)

  /** Where the session is: a reading's index, or its reflection. */
  readonly stage = computed((): number | "reflection" | null => {
    const day = this.active()
    // Not before the day's own stream is in: the last one's place would count.
    if (!day || this.player.current()?.url !== day.url) return null
    const at = this.player.position()
    if (at >= day.reflection) return "reflection"
    let reading = 0
    // Readings without timings (no heading found) can't be placed: skipped.
    day.readings.forEach(({ episode }, index) => {
      if (episode.start != null && episode.start <= at) reading = index
    })
    return reading
  })

  /**
   * The readings of the day under way heard through: entered near their
   * start and played across their end, not jumped over or scrubbed into.
   * The day is read once every timed one is (allHeard).
   */
  private readonly heard = new Set<number>()
  /** Where each reading was entered, to tell playing it from landing late. */
  private readonly enteredAt = new Map<number, number>()
  /** The last place the day was at: stage() is null once its stream is gone. */
  private reached: number | "reflection" | null = null

  private allHeard(day: PlanDay): boolean {
    return day.readings.every(
      ({ episode }, index) =>
        episode.start == null || episode.end == null || this.heard.has(index),
    )
  }

  constructor() {
    // First, so the stage below sees a last reading heard before it ends
    // the day. A reading heard: played across its end in one go, having been
    // entered near its start (⏭ and «Ouvir e ler» land on it).
    let previousAt = 0
    effect(() => {
      const day = this.active()
      const at = this.player.position()
      untracked(() => {
        const playing = !!day && this.player.current()?.url === day.url
        if (playing) {
          day.readings.forEach(({ episode: { start, end } }, index) => {
            const entered = this.enteredAt.get(index)
            const fromStart =
              entered != null && start != null && entered <= start + 5
            if (
              fromStart &&
              end != null &&
              previousAt < end &&
              at >= end &&
              at - previousAt < 3
            ) {
              this.heard.add(index)
            }
          })
        }
        previousAt = at
      })
    })
    // Per day: another day started at the same stage still takes it up.
    let last: { day: PlanDay | null; stage: number | "reflection" | null } = {
      day: null,
      stage: null,
    }
    effect(() => {
      const stage = this.stage()
      const day = this.active()
      untracked(() => {
        if (stage === last.stage && day === last.day) return
        // The same day's full copy (start()) re-adopts the reading for its
        // timings, but isn't a new entry into it: that stays where it was.
        const entering = stage !== last.stage || day?.day !== last.day?.day
        last = { day, stage }
        if (!day || stage === null) return
        this.reached = stage
        if (stage === "reflection") {
          // Its own span, so play and pause go on from here, not a chapter's top.
          this.player.throughFrom.set(day.reflection)
          this.player.adopt({
            day: day.day,
            // An introduction is all "reflection": its own title.
            title: day.readings.length ? `Reflexão: ${day.title}` : day.title,
            url: day.url,
            start: day.reflection,
            end: day.duration,
          })
          // The full copy: its timings only, not a second entry.
          if (!entering) return
          void this.analytics.track("plan_reflection", { day: day.day })
          // Its readings all heard, not skipped; an introduction counts
          // once heard out (below).
          if (day.readings.length && this.allHeard(day)) {
            this.markDone(day.day, true, "heard")
          }
          void this.router.navigate(["/mais365"])
          return
        }
        const reading = day.readings[stage]
        if (entering) this.enteredAt.set(stage, this.player.position())
        // Named for the system's player: the chapter, not the whole day.
        this.player.adopt({ ...reading.episode, title: readingLabel(reading) })
        // Once: the full copy's re-adoption mustn't take the reader back.
        if (entering) this.open(reading)
      })
    })
    // The episode over (or failed): the session with it.
    // Another stream taken up (a chapter of another day played by hand):
    // the day is left as it was, and that chapter plays as any other.
    effect(() => {
      const day = this.active()
      const current = this.player.current()
      if (day && current && current.url !== day.url) {
        untracked(() => this.release())
      }
    })
    effect(() => {
      const day = this.active()
      if (!day || this.player.current()) return
      untracked(() => {
        // Heard out: an introduction, or a day whose readings all were.
        const heardOut = this.player.position() >= day.duration - 5
        if (heardOut && (!day.readings.length || this.allHeard(day))) {
          this.markDone(day.day, true, "heard")
        }
        this.end()
      })
    })
  }

  /** The day being played through is this one (a light or a full copy of it). */
  isActive(day: PlanDay | undefined): boolean {
    return !!day && this.active()?.day === day.day
  }

  /**
   * Plays a day through: its first reading, and on from there. It starts at
   * once, within the tap (Safari refuses a play() a network wait away), then
   * takes the day's full copy for the verse timings read-along follows: the
   * stage effect adopts the reading again with them. Without it (offline,
   * say) it plays all the same.
   */
  async start(
    listed: PlanDay,
    at = 0,
    from: "plan" | "episode" = "plan",
  ): Promise<void> {
    this.begin(listed, at)
    // From the plan's page, or joined from a chapter's ⏮ ⏭ (at its first
    // reading too: from its second, ⏮ lands there).
    void this.analytics.track("plan_day_start", {
      day: listed.day,
      at,
      from,
    })
    const full = await firstValueFrom(
      this.http.get<PlanDay>(`${apiBaseUrl}/mais365/${listed.day}`),
    ).catch(() => null)
    if (full && this.active()?.day === listed.day) this.active.set(full)
  }

  /** Starts `day` at its reading `at` (its first, or one stepped to by ⏮ ⏭). */
  private begin(day: PlanDay, at = 0): void {
    this.heard.clear()
    this.enteredAt.clear()
    // The day before's stage would stand for this one's if it never plays.
    this.reached = null
    this.player.throughEpisode.set(true)
    this.player.throughFrom.set(0)
    this.player.mode.set("audio")
    this.player.collapsed.set(false)
    const first = day.readings[at] ?? day.readings[0]
    if (!first) {
      // An introduction: played whole, here.
      this.player.position.set(0)
      this.active.set(day)
      this.player.toggle({
        day: day.day,
        title: day.title,
        url: day.url,
        start: null,
        end: null,
      })
      return
    }
    // From its first reading, even with that reading paused further on.
    if (this.player.isCurrent(first.episode)) {
      this.player.seek(first.episode.start ?? 0)
    } else {
      this.player.position.set(first.episode.start ?? 0)
    }
    this.active.set(day)
    this.open(first)
    if (!this.player.isCurrent(first.episode) || !this.player.playing()) {
      this.player.toggle(first.episode)
    }
  }

  /**
   * Where a chapter stands in its episode's day, outside a day being played:
   * what ⏮ ⏭ step to (the episode's readings, not the chapter's neighbours).
   * Needs the days loaded (load()).
   */
  episodeReadings(
    day: number,
    bookId: string,
    chapter: number,
  ): { day: PlanDay; index: number } | null {
    const listed = this.days().find((d) => d.day === day)
    const index =
      listed?.readings.findIndex(
        (r) => r.bookId === bookId && r.chapter === chapter,
      ) ?? -1
    return listed && index >= 0 ? { day: listed, index } : null
  }

  /** What follows the reading being heard: the next one, or the reflection. */
  readonly next = computed((): PlanReading | "reflection" | null => {
    const day = this.active()
    const stage = this.stage()
    if (!day || typeof stage !== "number") return null
    return (
      day.readings.find((r, i) => i > stage && r.episode.start != null) ??
      "reflection"
    )
  })

  /** The reading before: the day's previous one, or from the reflection its last. */
  readonly previous = computed((): PlanReading | null => {
    const day = this.active()
    const stage = this.stage()
    if (!day || stage === null || !day.readings.length) return null
    const before = stage === "reflection" ? day.readings.length : stage
    // The nearest one with timings: one without can't be sought.
    const timed = day.readings
      .slice(0, before)
      .filter((r) => r.episode.start != null)
    return timed.at(-1) ?? null
  })

  /** Back to the start of the day's previous reading. */
  back(): void {
    const previous = this.previous()
    if (!previous) return
    // ⏮ is the one way from the reflection back into its readings.
    this.player.throughFrom.set(0)
    this.player.seek(previous.episode.start ?? 0)
  }

  /** Skips the rest of the reading being heard. */
  skip(): void {
    const day = this.active()
    const next = this.next()
    if (!day || !next) return
    this.player.seek(
      next === "reflection" ? day.reflection : (next.episode.start ?? 0),
    )
  }

  /** Pauses or resumes the day where it is (its reflection, say). */
  toggle(): void {
    const current = this.player.current()
    if (current) this.player.toggle(current)
  }

  /** Ends the session (the reflection skipped, or the episode over). */
  end(): void {
    const day = this.active()
    // Ended before its reflection: where the listener left it.
    const stage = this.stage() ?? this.reached
    if (day && stage !== "reflection") {
      void this.analytics.track("plan_day_end", { day: day.day, stage })
    }
    this.player.pause()
    this.release()
  }

  /** Lets the player go back to chapters, playing or not. */
  private release(): void {
    this.active.set(null)
    this.reached = null
    this.player.throughEpisode.set(false)
    this.player.throughFrom.set(0)
  }

  /** `how`: heard through (its readings, or an introduction), or by hand. */
  markDone(
    day: number,
    done: boolean,
    how: "heard" | "marked" = "marked",
  ): void {
    if (this.done().includes(day) !== done) {
      void this.analytics.track("plan_day_done", {
        day,
        how: done ? how : "unmarked",
      })
    }
    const days = this.done().filter((d) => d !== day)
    this.done.set(done ? [...days, day] : days)
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(this.done()))
    } catch {
      // Not kept: done until the app closes.
    }
  }

  private storedDone(): number[] {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]")
      return Array.isArray(stored)
        ? stored.filter((day): day is number => Number.isFinite(day))
        : []
    } catch {
      return []
    }
  }
}
