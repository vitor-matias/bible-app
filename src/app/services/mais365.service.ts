import {
  computed,
  effect,
  Injectable,
  inject,
  signal,
  untracked,
} from "@angular/core"
import { Router } from "@angular/router"
import { TEST_INTROS } from "./mais365-test-intros"
import { TEST_PLAN } from "./mais365-test-plan"
import {
  type ChapterEpisode,
  PodcastPlayerService,
} from "./podcast-player.service"

/** One of a +365 day's readings: a chapter, and its part of the episode. */
export interface PlanReading {
  bookId: string
  bookName: string
  chapter: number
  episode: ChapterEpisode
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

  /** The days, with the introductions after the day they came out with. */
  readonly days: PlanDay[] = [...TEST_PLAN, ...TEST_INTROS].sort(
    (a, b) => a.day - b.day,
  )
  readonly done = signal<number[]>(this.storedDone())
  readonly today = computed(
    () =>
      this.days.find((day) => !this.done().includes(day.day)) ??
      this.days[this.days.length - 1],
  )

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
    day.readings.forEach(({ episode }, index) => {
      if ((episode.start ?? 0) <= at) reading = index
    })
    return reading
  })

  constructor() {
    let last: number | "reflection" | null = null
    effect(() => {
      const stage = this.stage()
      untracked(() => {
        if (stage === last) return
        last = stage
        const day = this.active()
        if (!day || stage === null) return
        if (stage === "reflection") {
          // Its own span, so play and pause go on from here, not a chapter's top.
          this.player.adopt({
            day: day.day,
            title: `Reflexão: ${day.title}`,
            url: day.url,
            start: day.reflection,
            end: day.duration,
          })
          // Heard its readings; an introduction counts once heard out.
          if (day.readings.length) this.markDone(day.day, true)
          void this.router.navigate(["/365"])
          return
        }
        const reading = day.readings[stage]
        // Named for the system's player: the chapter, not the whole day.
        this.player.adopt({
          ...reading.episode,
          title: `${reading.bookName} ${reading.chapter}`,
        })
        void this.router.navigate(["/", reading.bookId, reading.chapter])
      })
    })
    // The episode over (or failed): the session with it.
    effect(() => {
      const day = this.active()
      if (!day || this.player.current()) return
      untracked(() => {
        if (this.player.position() >= day.duration - 5) {
          this.markDone(day.day, true)
        }
        this.end()
      })
    })
  }

  /** Plays a day through: its first reading, and on from there. */
  start(day: PlanDay): void {
    this.player.throughEpisode.set(true)
    this.player.mode.set("audio")
    this.player.collapsed.set(false)
    const first = day.readings[0]
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
    this.player.position.set(first.episode.start ?? 0)
    this.active.set(day)
    void this.router.navigate(["/", first.bookId, first.chapter])
    if (!this.player.isCurrent(first.episode) || !this.player.playing()) {
      this.player.toggle(first.episode)
    }
  }

  /** Pauses or resumes the day where it is (its reflection, say). */
  toggle(): void {
    const current = this.player.current()
    if (current) this.player.toggle(current)
  }

  /** Ends the session (the reflection skipped, or the episode over). */
  end(): void {
    this.player.pause()
    this.active.set(null)
    this.player.throughEpisode.set(false)
  }

  markDone(day: number, done: boolean): void {
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
      return JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as number[]
    } catch {
      return []
    }
  }
}
