import { HttpClient } from "@angular/common/http"
import { effect, Injectable, inject, signal, untracked } from "@angular/core"
import { catchError, map, type Observable, of } from "rxjs"
import { apiBaseUrl } from "../config"
import { AnalyticsService } from "./analytics.service"
import { KeepAwakeService } from "./keep-awake.service"

/** A +365 episode that reads a chapter, as bible-api's /audio lists it. */
export interface ChapterEpisode {
  day: number
  title: string
  url: string
  /** Seconds where the chapter's reading starts; null plays from the top. */
  start: number | null
  /** Seconds where it ends; null when unknown (the episode's end, then). */
  end: number | null
  /** [first, last] verse, when only part of the chapter is read that day. */
  range?: [number, number]
  /** [verse, seconds] where each verse starts, for following the reading. */
  verses?: [number, number][]
}

const RATES = [0.5, 0.75, 1, 1.1, 1.25, 1.5, 2]

/**
 * "1×", "1⅒×", "1¼×", "1½×", "¾×", as the apps' speed button: fractions,
 * which read at a glance on a small button; anything else with the decimal
 * comma. Rounded first: 1.1 − 1 is not quite 0.1 in floating point.
 */
export const rateTitle = (rate: number): string => {
  const whole = Math.floor(rate)
  const part = Math.round((rate - whole) * 100) / 100
  const fraction = { 0: "", 0.1: "⅒", 0.25: "¼", 0.5: "½", 0.75: "¾" }[part]
  if (fraction === undefined) return `${String(rate).replace(".", ",")}×`
  return `${whole === 0 && fraction ? "" : whole}${fraction}×`
}

/** How long read-along leaves the text alone after the reader moves it. */
export const FOLLOW_PAUSE_MS = 6000
/** Keys that move the text: read-along leaves it alone after them. */
export const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "ArrowLeft",
  "ArrowRight",
])

/**
 * Where the <audio> loads an episode from. A media fragment makes the browser
 * start at the chapter once the stream loads. (public/app-worker.js keeps the
 * service worker out of the stream's requests.)
 */
const streamUrl = ({ url, start }: ChapterEpisode): string =>
  start ? `${url}#t=${start}` : url

/**
 * Plays +365 podcast episodes (EJNS Portugal, a Bible-in-a-year reading),
 * streamed from the podcast's own host. One player for the whole app, so the
 * audio carries on while the reader turns chapters.
 */
@Injectable({ providedIn: "root" })
export class PodcastPlayerService {
  private http = inject(HttpClient)
  private audio?: HTMLAudioElement

  /** The episode loaded in the player, playing or paused. */
  readonly current = signal<ChapterEpisode | null>(null)
  readonly playing = signal(false)
  readonly rate = signal(1)
  /** Where the stream is, and how long it lasts, in seconds; 0 until known. */
  readonly position = signal(0)
  readonly duration = signal(0)
  /** What the floating control does: scroll the text, or play +365. */
  readonly mode = signal<"scroll" | "audio">("scroll")
  /** «Ouvir» tucked into a small pill, the card out of the text's way. */
  readonly collapsed = signal(false)
  /**
   * A +365 day plays straight through (Mais365Service): its readings one
   * after another, then the reflection, without stopping at a chapter's end.
   */
  readonly throughEpisode = signal(false)
  /**
   * Where playing through may go back to: a day's reflection, which back
   * 10 s (the card's, the system player's) doesn't leave for its readings.
   */
  readonly throughFrom = signal(0)

  /**
   * Makes another chapter's entry of the same stream the one in the player,
   * without seeking: a +365 day moving on to its next reading.
   */
  adopt(episode: ChapterEpisode): void {
    if (this.current()?.url === episode.url) this.current.set(episode)
  }

  /** The episodes that read a chapter, earliest day first; [] when none. */
  episodesFor(bookId: string, chapter: number): Observable<ChapterEpisode[]> {
    return this.http
      .get<{ episodes: ChapterEpisode[] }>(
        `${apiBaseUrl}/audio/${bookId}/${chapter}`,
      )
      .pipe(
        map((response) => response.episodes),
        catchError(() => of([])),
      )
  }

  /** Whether a chapter's entry is the one in the player. */
  isCurrent(episode: ChapterEpisode): boolean {
    const current = this.current()
    return current?.url === episode.url && current.start === episode.start
  }

  /**
   * Pauses or resumes a chapter's entry already in the player; any other
   * plays from where its chapter starts. Chapters read in one episode share
   * its stream, so moving between them seeks instead of reloading.
   */
  toggle(episode: ChapterEpisode): void {
    this.audio ??= this.createAudio()
    const audio = this.audio
    if (this.isCurrent(episode)) {
      if (this.playing()) {
        audio.pause()
        return
      }
      // Stopped at the chapter's end, play reads it again from the top. Not
      // in a +365 day, paused between two readings: it goes on to the next.
      if (
        episode.end != null &&
        audio.currentTime >= episode.end &&
        !this.throughEpisode()
      ) {
        audio.currentTime = episode.start ?? 0
      }
      this.play(audio, episode)
      return
    }
    const loaded =
      this.current()?.url === episode.url &&
      audio.readyState >= HTMLMediaElement.HAVE_METADATA
    this.current.set(episode)
    if (loaded) {
      audio.currentTime = episode.start ?? 0
      // The seek lands with a later timeupdate; till then the last chapter's
      // place would show, clamped into this one's span.
      this.position.set(episode.start ?? 0)
    } else {
      // Reloading also replaces the fragment of a stream still loading, which
      // would otherwise win over a later chapter's start of zero.
      audio.src = streamUrl(episode)
      // A new source resets the element's length and place without saying so:
      // the last episode's would otherwise stand until this one's load.
      this.duration.set(0)
      this.position.set(episode.start ?? 0)
    }
    this.play(audio, episode)
  }

  private readonly analytics = inject(AnalyticsService)

  constructor() {
    // Each start or resume of playback, with what plays.
    let wasPlaying = false
    effect(() => {
      const playing = this.playing()
      untracked(() => {
        const current = this.current()
        if (playing && !wasPlaying && current) {
          void this.analytics.track("podcast_play", {
            day: current.day,
            title: current.title,
            rate: this.rate(),
          })
        }
        wasPlaying = playing
      })
    })
    // Read along, the phone mustn't lock while +365 plays.
    const keepAwake = inject(KeepAwakeService)
    effect(() => {
      const playing = this.playing()
      untracked(() =>
        playing ? keepAwake.start("podcast") : keepAwake.stop("podcast"),
      )
    })
    // The system's player (lock screen, menu bar, headphones) shows the part
    // being heard, the chapter or the reflection, not the whole episode.
    effect(() => {
      const current = this.current()
      const position = this.position()
      const rate = this.rate()
      const duration = this.duration()
      untracked(() => this.syncMediaSession(current, position, rate, duration))
    })
  }

  /** Moves the playing episode back (negative) or forward, in seconds. */
  skip(seconds: number): void {
    const audio = this.audio
    const current = this.current()
    if (!audio || !current) return
    // Before the stream loads, currentTime reads 0, not the chapter's start
    // its fragment will seek to; what is written here then wins over that.
    // A skip already asked for still reads back from currentTime, so taps
    // add up: 56.5, 66.5, 76.5.
    const from =
      audio.readyState >= HTMLMediaElement.HAVE_METADATA
        ? audio.currentTime
        : Math.max(current.start ?? 0, audio.currentTime)
    audio.currentTime = this.withinChapter(from + seconds)
  }

  /**
   * Keeps a time inside the chapter's reading: the episode is never heard
   * before its start nor past its end (the whole episode where unknown).
   */
  private withinChapter(seconds: number): number {
    if (this.throughEpisode()) return Math.max(this.throughFrom(), seconds)
    const current = this.current()
    const start = current?.start ?? 0
    const end = current?.end ?? Number.POSITIVE_INFINITY
    return Math.min(end, Math.max(start, seconds))
  }

  /**
   * timeupdate comes only every quarter second or so: too coarse for the
   * chapter's end, past which the next heading or the commentary begins. So
   * the last stretch is timed to the millisecond instead.
   */
  private endTimer?: ReturnType<typeof setTimeout>

  private guardChapter(audio: HTMLAudioElement): void {
    if (this.throughEpisode()) return
    const end = this.current()?.end
    if (audio.currentTime < (this.current()?.start ?? 0)) {
      audio.currentTime = this.withinChapter(audio.currentTime)
    }
    if (end == null || !this.playing() || this.endTimer) return
    const left = (end - audio.currentTime) / audio.playbackRate
    if (left <= 0) this.stopAtEnd(audio)
    else if (left < 1) {
      this.endTimer = setTimeout(() => this.stopAtEnd(audio), left * 1000)
    }
  }

  private stopAtEnd(audio: HTMLAudioElement): void {
    this.clearEndTimer()
    const end = this.current()?.end
    if (end == null) return
    // Short of the end (the stream stalled, or the timer ran early): time the
    // rest again rather than cut it off.
    if (audio.currentTime < end - 0.02) {
      this.guardChapter(audio)
      return
    }
    audio.pause()
    audio.currentTime = end
    this.position.set(end)
  }

  private clearEndTimer(): void {
    clearTimeout(this.endTimer)
    this.endTimer = undefined
  }

  readonly canSlower = () => this.rate() > RATES[0]
  readonly canFaster = () => this.rate() < RATES[RATES.length - 1]

  /**
   * The next speed, round from the fastest to the slowest: one button for
   * all of them, as podcast apps have (the iOS app's "1×").
   */
  cycleRate(): void {
    const index = RATES.indexOf(this.rate())
    this.setRate(RATES[(index + 1) % RATES.length])
  }

  private setRate(next: number): void {
    if (next !== this.rate()) {
      void this.analytics.track("podcast_speed", { rate: next })
    }
    this.rate.set(next)
    if (this.audio) {
      // The default survives a new src, which resets playbackRate to it.
      this.audio.defaultPlaybackRate = next
      this.audio.playbackRate = next
    }
  }

  /** Moves the episode in the player to a second of it. */
  seek(seconds: number): void {
    if (!this.audio || !this.current()) return
    const within = this.withinChapter(seconds)
    this.audio.currentTime = within
    this.position.set(within)
  }

  /** Where the stream is right now, finer than position's timeupdates. */
  now(): number {
    return this.audio?.currentTime ?? this.position()
  }

  pause(): void {
    this.audio?.pause()
  }

  private holds = 0
  private resumeAfterHolds = false

  /**
   * Pauses while something is read over the text (a footnote), and returns
   * what resumes it: once the last hold is let go, if it was playing. Let go
   * with `resume` false (the reader went elsewhere), it stays paused.
   */
  hold(): (resume?: boolean) => void {
    if (this.holds++ === 0) {
      this.resumeAfterHolds = this.playing()
      if (this.resumeAfterHolds) this.pause()
    }
    let released = false
    return (resume = true) => {
      if (released) return
      released = true
      if (!resume) this.resumeAfterHolds = false
      if (--this.holds > 0 || !this.resumeAfterHolds) return
      this.resumeAfterHolds = false
      const current = this.current()
      if (current && !this.playing()) this.toggle(current)
    }
  }

  private play(audio: HTMLAudioElement, episode: ChapterEpisode): void {
    audio.play().catch((error: unknown) => {
      // A pause, or a new stream, aborts a play() still loading: that is no
      // failure (a broken load fires "error"). Nor is another entry's.
      const aborted =
        error instanceof DOMException && error.name === "AbortError"
      if (!aborted && this.isCurrent(episode)) this.forget()
    })
  }

  /** Lets the next touch load the chapter afresh, from its start. */
  private forget(): void {
    this.playing.set(false)
    this.current.set(null)
  }

  private syncMediaSession(
    current: ChapterEpisode | null,
    position: number,
    rate: number,
    duration: number,
  ): void {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return
    const session = navigator.mediaSession
    if (!current) {
      session.metadata = null
      return
    }
    if (session.metadata?.title !== current.title) {
      session.metadata = new MediaMetadata({
        title: current.title,
        artist: "+365",
        album: "Bíblia Sagrada",
        artwork: [
          {
            src: "/icons/maskable_icon_x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      })
    }
    const start = current.start ?? 0
    const span = (current.end ?? duration) - start
    if (!(span > 0)) return
    try {
      session.setPositionState({
        duration: span,
        position: Math.min(span, Math.max(0, position - start)),
        playbackRate: rate,
      })
    } catch {
      // Not every browser takes a position state; its own then shows.
    }
  }

  /** The system player's seek and skip, in the part's own time. */
  private handleMediaSession(): void {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return
    const session = navigator.mediaSession
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        "seekto",
        ({ seekTime }) =>
          seekTime != null &&
          this.seek((this.current()?.start ?? 0) + seekTime),
      ],
      // The app's own ±15 s where the system names no offset.
      ["seekbackward", ({ seekOffset }) => this.skip(-(seekOffset ?? 15))],
      ["seekforward", ({ seekOffset }) => this.skip(seekOffset ?? 15)],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // An action this browser doesn't know.
      }
    }
  }

  private createAudio(): HTMLAudioElement {
    this.handleMediaSession()
    const audio = new Audio()
    audio.preload = "none"
    audio.defaultPlaybackRate = this.rate()
    audio.addEventListener("play", () => this.playing.set(true))
    audio.addEventListener("pause", () => {
      this.clearEndTimer()
      this.playing.set(false)
    })
    // A move or a new speed changes when the end comes: time it afresh.
    audio.addEventListener("seeking", () => this.clearEndTimer())
    audio.addEventListener("ratechange", () => {
      this.clearEndTimer()
      // A new speed brings the end sooner or later: time it at once, as the
      // next timeupdate may only come after it.
      this.guardChapter(audio)
    })
    audio.addEventListener("timeupdate", () => {
      this.position.set(audio.currentTime)
      this.guardChapter(audio)
    })
    // A live or unknown length reads Infinity or NaN: no position to pick.
    audio.addEventListener("durationchange", () =>
      this.duration.set(Number.isFinite(audio.duration) ? audio.duration : 0),
    )
    // A stream that ended or failed is not resumed: play() would restart an
    // ended one at 0:00 and keep failing on a broken load.
    audio.addEventListener("ended", () => this.forget())
    audio.addEventListener("error", () => this.forget())
    return audio
  }
}
