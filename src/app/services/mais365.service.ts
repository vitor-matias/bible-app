import { HttpClient } from "@angular/common/http"
import {
  computed,
  DestroyRef,
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
import { ToastService } from "./toast.service"

/** One of a +365 day's readings: a chapter, and its part of the episode. */
export interface PlanReading {
  bookId: string
  bookName: string
  chapter: number
  /** [first, last] verse, when only part of the chapter is read (Provérbios 1,1-7). */
  range?: [number, number]
  /**
   * Its name as printed, where its verses as stored would read wrongly:
   * «Ester A» for Ester 1,1-17, the addition stored at the chapter's head.
   */
  label?: string
  /** The verse its link opens at, as printed: "A1", "1". */
  verseStart?: string
  episode: ChapterEpisode
}

/** "Génesis 12", or "Provérbios 1,1-7" for part of a chapter. */
export const readingLabel = ({
  bookName,
  chapter,
  range,
  label,
}: PlanReading) =>
  label ??
  (range
    ? `${bookName} ${chapter},${range[0]}${range[1] === range[0] ? "" : `-${range[1]}`}`
    : `${bookName} ${chapter}`)

/**
 * A day's readings in a line: "Génesis 1–2 · Salmo 19", a book's chapters
 * in a row told as one span.
 */
export const readingsSummary = (readings: PlanReading[]): string => {
  const spans: { book: string; from: number; to: number; part?: string }[] = []
  for (const reading of readings) {
    const last = spans.at(-1)
    if (
      last &&
      !last.part &&
      !reading.range &&
      !reading.label &&
      last.book === reading.bookName &&
      reading.chapter === last.to + 1
    ) {
      last.to = reading.chapter
    } else {
      spans.push({
        book: reading.bookName,
        from: reading.chapter,
        to: reading.chapter,
        part: (reading.range || reading.label) && readingLabel(reading),
      })
    }
  }
  return spans
    .map(
      ({ book, from, to, part }) =>
        part ?? (to > from ? `${book} ${from}–${to}` : `${book} ${from}`),
    )
    .join(" · ")
}

/** A period of the plan: the days from one introduction to the next. */
export interface PlanSection {
  /** "Patriarcas", from «Introdução aos Patriarcas»; none before the first. */
  name: string
  days: PlanDay[]
}

/** The days by period: each introduction (a day without readings) opens one. */
export const planSections = (days: PlanDay[]): PlanSection[] => {
  const sections: PlanSection[] = []
  let current: PlanSection | undefined
  for (const day of days) {
    if (!current || !day.readings.length) {
      current = {
        name: day.readings.length
          ? ""
          : day.title.replace(/^Introdução (?:aos?|às?) /, ""),
        days: [],
      }
      sections.push(current)
    }
    current.days.push(day)
  }
  return sections
}

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

const PROGRESS_KEY = "mais365Progress"
const DONE_KEY = "mais365Done"
/** The day each was read on (local "YYYY-MM-DD"), for the streak: kept beside
 * DONE_KEY, which predates it, so days read before have none. */
const DONE_ON_KEY = "mais365DoneOn"

/** A local date as "YYYY-MM-DD", the day the reader lives in. */
export const localDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/**
 * The run of days in a row, up to `today`, with a day of the plan read on
 * each: how long, and the day it began. Not broken yet by today, still to
 * come: it runs from yesterday until then.
 */
export const streakRun = (
  dates: Iterable<string>,
  today: Date,
): { length: number; start: string | null } => {
  const read = new Set(dates)
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!read.has(localDay(day))) day.setDate(day.getDate() - 1)
  let length = 0
  let start: string | null = null
  while (read.has(localDay(day))) {
    length++
    start = localDay(day)
    day.setDate(day.getDate() - 1)
  }
  return { length, start }
}

/** Days in a row, up to `today`, with a day of the plan read on each. */
export const streakOf = (dates: Iterable<string>, today: Date): number =>
  streakRun(dates, today).length

/** The runs celebrated: a week, a month, a hundred days, a year. */
export const STREAK_MILESTONES = [
  3, 7, 14, 30, 50, 100, 150, 200, 250, 300, 365,
] as const

/** Milestones already shown: "<run's first day>:<days>". */
const CELEBRATED_KEY = "mais365Celebrated"

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
  private readonly toast = inject(ToastService)

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
  query(
    reading: PlanReading,
  ): { verseStart: number | string; highlight: false } | null {
    // As printed when the data says ("A1" for Ester's addition A).
    const verseStart = reading.verseStart ?? reading.range?.[0]
    return verseStart === undefined ? null : { verseStart, highlight: false }
  }

  /** The chapter last opened for the day: while the reader stays on it, it follows. */
  private opened: string | null = null

  private path(reading: PlanReading): string {
    return this.link(reading).join("/").replace(/^\/+/, "/")
  }

  /**
   * The reader is on the reading the day was at (or last opened), or on the
   * plan's page: the next reading (or the reflection) is opened for it.
   * Another chapter picked meanwhile isn't left without asking.
   */
  private following(before?: PlanReading): boolean {
    const path = this.router.url.split(/[?#]/)[0]
    return (
      path === "/mais365" ||
      path === this.opened ||
      (!!before && path === this.path(before))
    )
  }

  /** Where the day has gone on to, for a reader elsewhere: a tap opens it. */
  private offerOpen(label: string, open: () => void): void {
    this.toast.showOpen(`+365 · Agora: ${label}`, "Abrir", open)
  }

  /** Turns the reader to a reading, at its first verse. */
  private open(reading: PlanReading, replaceUrl = false): void {
    this.opened = this.path(reading)
    const queryParams = this.query(reading)
    const extras = {
      ...(queryParams && { queryParams }),
      ...(replaceUrl && { replaceUrl }),
    }
    void (Object.keys(extras).length
      ? this.router.navigate(this.link(reading), extras)
      : this.router.navigate(this.link(reading)))
  }

  /**
   * The day turning a reader that follows it to its next reading: in place,
   * as the reader's own chapter steps are, so Back leaves for where the
   * reader came from (the plan's page), not through the day's chapters.
   * From the plan's page, an entry of its own.
   */
  private turn(reading: PlanReading): void {
    const path = this.router.url.split(/[?#]/)[0]
    this.open(reading, path !== "/mais365")
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
  /**
   * When each day was first read: plan day → local "YYYY-MM-DD". Kept when
   * the day is unmarked, so marking it again (a mis-tap) restores its date;
   * only days in done() count toward the streak.
   */
  readonly doneOn = signal<Record<number, string>>(this.storedDoneOn())
  /**
   * The readings heard through of the day last played, kept to come back
   * to: each a checkpoint, «Continuar» goes on from the first one not heard.
   */
  readonly progress = signal<{ day: number; heard: number[] } | null>(
    this.storedProgress(),
  )
  /** The local day, refreshed past midnight and on coming back to the app. */
  readonly clockDay = signal(localDay(new Date()))
  private readonly run = computed(() => {
    const [y, m, d] = this.clockDay().split("-").map(Number)
    const read = this.done().flatMap((day) => this.doneOn()[day] ?? [])
    return streakRun(read, new Date(y, m - 1, d))
  })
  /** Days in a row with a day of the plan read, as of now. */
  readonly streak = computed(() => this.run().length)
  /**
   * The latest day a plan day still marked read was read on: an unmarked
   * day keeps its date (doneOn), but no longer counts as read.
   */
  readonly lastReadOn = computed(
    () =>
      this.done()
        .flatMap((day) => this.doneOn()[day] ?? [])
        .sort()
        .at(-1) ?? null,
  )
  private readonly celebrated = signal<string[]>(this.storedCelebrated())
  /**
   * A milestone just reached and not yet celebrated: once per run, so a
   * streak begun again earns its week anew.
   */
  readonly milestone = computed(() => {
    const { length, start } = this.run()
    const key = `${start}:${length}`
    return start &&
      (STREAK_MILESTONES as readonly number[]).includes(length) &&
      !this.celebrated().includes(key)
      ? { days: length, key }
      : null
  })

  /** A milestone seen: not shown again. */
  celebrate(key: string): void {
    void this.analytics.track("plan_streak_milestone", {
      days: Number(key.split(":")[1]),
    })
    // The latest few: a run's milestones, and the run before.
    this.celebrated.set([...this.celebrated(), key].slice(-24))
    try {
      localStorage.setItem(CELEBRATED_KEY, JSON.stringify(this.celebrated()))
    } catch {
      // Not kept: shown again after a restart, at worst.
    }
  }
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
    // The episode's opening, before its first reading: no reading yet.
    const first = day.readings.find(({ episode }) => episode.start != null)
    if (first && at < (first.episode.start ?? 0) - 0.5) return null
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
    this.keepTodayFresh()
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
            // Scrubbed or skipped ahead within it: no longer heard from its start.
            const within =
              start != null && previousAt >= start && previousAt < (end ?? at)
            if (within && at - previousAt >= 3 && at < (end ?? at + 1)) {
              this.enteredAt.delete(index)
            }
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
              this.saveProgress({
                day: day.day,
                heard: [...this.heard].sort((a, b) => a - b),
              })
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
        // The reading the day was at: the reader on it follows on.
        const before =
          typeof last.stage === "number"
            ? last.day?.readings[last.stage]
            : undefined
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
          const toPlan = () => void this.router.navigate(["/mais365"])
          if (this.following(before)) toPlan()
          else this.offerOpen("Reflexão", toPlan)
          return
        }
        const reading = day.readings[stage]
        if (entering) this.enteredAt.set(stage, this.player.position())
        // Named for the system's player: the chapter, not the whole day.
        this.player.adopt({ ...reading.episode, title: readingLabel(reading) })
        // Once: the full copy's re-adoption mustn't take the reader back.
        if (!entering) return
        if (this.following(before)) this.turn(reading)
        else this.offerOpen(readingLabel(reading), () => this.open(reading))
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

  /** `today` follows the clock: midnight's timer, and the app coming back. */
  private keepTodayFresh(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return
    const refresh = () => this.clockDay.set(localDay(new Date()))
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      const now = new Date()
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      )
      timer = setTimeout(() => {
        refresh()
        arm()
      }, midnight.getTime() - now.getTime())
    }
    arm()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", refresh)
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", refresh)
    })
  }

  /**
   * The episode's intro under way, before its first reading (from «Ouvir e
   * ler»): where that reading starts. Heard on the plan's page, as the
   * reflection.
   */
  readonly introUntil = computed(() => {
    const day = this.active()
    if (!day || this.stage() !== null) return null
    const start = day.readings.find((r) => r.episode.start != null)?.episode
      .start
    return start && this.player.current()?.url === day.url ? start : null
  })

  /** The readings of `day` heard through, this time or an earlier one. */
  heardOf(day: PlanDay): number[] {
    const progress = this.progress()
    return progress?.day === day.day ? progress.heard : []
  }

  /**
   * Where «Continuar» takes `day`: its first timed reading not yet heard;
   * null with none heard, all heard, or the day read.
   */
  resumeAt(day: PlanDay): { at: number } | null {
    const heard = this.heardOf(day)
    if (!heard.length || this.done().includes(day.day)) return null
    const at = day.readings.findIndex(
      ({ episode }, index) => episode.start != null && !heard.includes(index),
    )
    return at < 0 ? null : { at }
  }

  /** «Recomeçar»: what was heard of `day` forgotten, from its intro. */
  restart(day: PlanDay): Promise<void> {
    if (this.progress()?.day === day.day) this.saveProgress(null)
    return this.start(day, 0, "plan", true)
  }

  private saveProgress(progress: { day: number; heard: number[] } | null) {
    this.progress.set(progress)
    try {
      if (progress) localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
      else localStorage.removeItem(PROGRESS_KEY)
    } catch {
      // Not kept: until the app closes.
    }
  }

  private storedProgress(): { day: number; heard: number[] } | null {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(PROGRESS_KEY) ?? "null",
      )
      if (!stored || typeof stored !== "object") return null
      const { day, heard } = stored as { day: unknown; heard: unknown }
      return typeof day === "number" &&
        Array.isArray(heard) &&
        heard.every((index) => Number.isInteger(index))
        ? { day, heard }
        : null
    } catch {
      return null
    }
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
    /** The episode's own opening first, the podcast's welcome, with a way past it. */
    intro = false,
  ): Promise<void> {
    this.begin(listed, at, intro && at === 0)
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
  private begin(day: PlanDay, at = 0, intro = false): void {
    // What was heard of it before counts on: the day is read once all is.
    this.heard.clear()
    for (const index of this.heardOf(day)) this.heard.add(index)
    this.enteredAt.clear()
    // The day before's stage would stand for this one's if it never plays.
    this.reached = null
    this.player.throughEpisode.set(true)
    this.player.throughFrom.set(0)
    this.player.mode.set("audio")
    this.player.collapsed.set(false)
    const first = day.readings[at] ?? day.readings[0]
    if (!first) {
      // An introduction: played whole, here, from its top even if left
      // further on («Terminar», then «Ouvir»).
      const whole = {
        day: day.day,
        title: day.title,
        url: day.url,
        start: null,
        end: null,
      }
      if (this.player.isCurrent(whole)) this.player.seek(0)
      else this.player.position.set(0)
      this.active.set(day)
      if (!this.player.isCurrent(whole) || !this.player.playing()) {
        this.player.toggle(whole)
      }
      return
    }
    // From its first reading, even with that reading paused further on; or
    // from the episode's start, its intro before that reading.
    const from = intro ? 0 : (first.episode.start ?? 0)
    // The intro: the first reading's stream from the episode's start, taken
    // as that reading once it begins (stage).
    // Up to that reading, and named as what it is (not the API's "Dia 7 -
    // …", which the card's caption would say twice), for its time left too.
    const episode = intro
      ? {
          ...first.episode,
          start: 0,
          end: first.episode.start,
          title: "Introdução",
        }
      : first.episode
    // Either entry left in the player (the intro's, after «Terminar»): from
    // the top, not where it stopped.
    if (
      this.player.isCurrent(first.episode) ||
      this.player.isCurrent(episode)
    ) {
      this.player.seek(from)
    } else {
      this.player.position.set(from)
    }
    this.active.set(day)
    // The intro stays on the plan's page; its reading opens once it begins.
    if (!intro) this.open(first)
    if (!this.player.isCurrent(episode) || !this.player.playing()) {
      this.player.toggle(episode)
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
    // In the intro (stage null) its first reading: ⏭ skips the intro.
    if (!day || stage === "reflection") return null
    const at = stage ?? -1
    return (
      day.readings.find((r, i) => i > at && r.episode.start != null) ??
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
    // Let go: the system's player can't resume a day ended.
    this.player.stop()
    this.release()
  }

  /** Lets the player go back to chapters, playing or not. */
  private release(): void {
    // Its way back from a reading opened on the card leads nowhere now.
    this.toast.dismissReturnToPlan()
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
    // Read: nothing left to go on with.
    if (done && this.progress()?.day === day) this.saveProgress(null)
    // The day it was first read keeps its date, even unmarked: marked again,
    // it isn't read anew.
    if (done && !this.doneOn()[day]) {
      this.doneOn.set({ ...this.doneOn(), [day]: localDay(new Date()) })
    }
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(this.done()))
      localStorage.setItem(DONE_ON_KEY, JSON.stringify(this.doneOn()))
    } catch {
      // Not kept: done until the app closes.
    }
  }

  private storedCelebrated(): string[] {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(CELEBRATED_KEY) ?? "[]",
      )
      return Array.isArray(stored)
        ? stored.filter((key): key is string => typeof key === "string")
        : []
    } catch {
      return []
    }
  }

  private storedDoneOn(): Record<number, string> {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(DONE_ON_KEY) ?? "{}",
      )
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
        return {}
      }
      return Object.fromEntries(
        Object.entries(stored).filter(
          ([day, date]) =>
            Number.isFinite(Number(day)) &&
            typeof date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(date),
        ),
      )
    } catch {
      return {}
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
