import { HttpClient } from "@angular/common/http"
import { effect, Injectable, inject, signal, untracked } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { catchError, map, type Observable, of } from "rxjs"
import { apiBaseUrl } from "../config"
import { AnalyticsService } from "./analytics.service"
import { KeepAwakeService } from "./keep-awake.service"
import { NativeChromeService } from "./native-chrome.service"
import type { NativeChromeAction } from "./native-chrome.types"

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
  /** Read in part: where its heading's chapter name ends ("Provérbios 3"). */
  titleEnd?: number
  /** And where it starts, which the part's own start may be well before. */
  titleStart?: number
  /**
   * A stretch not to be heard, jumped over: a chapter heard whole leaves out
   * its first part's "1 a 4" after the chapter's name.
   */
  skip?: [number, number]
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
 * Gives an element that has played a new source, reset first: on iOS one
 * paused and handed another stream kept its old intent to play, starting the
 * new one by itself, or playing it without ever saying so.
 */
const reload = (audio: HTMLAudioElement, src: string): void => {
  audio.pause()
  audio.removeAttribute("src")
  audio.load()
  audio.src = src
}

/**
 * How long a part goes on past its end when another follows: its end is where
 * Whisper's next segment begins, which can fall within the last word (Pv 3:24's
 * «agradável»). Not much more: the end-of-reading jingle can follow at once
 * (heard at 0.5 s, its first 0.15 s at 0.3 s, a trace at 0.15 s).
 */
const PART_TAIL = 0.05

const samePart = (a: ChapterEpisode, b: ChapterEpisode): boolean =>
  a.url === b.url && a.start === b.start

const spanOf = (part: ChapterEpisode): number =>
  Math.max(0, (part.end ?? part.start ?? 0) - (part.start ?? 0))

/**
 * A chapter read in parts (Salmo 119 over three days), heard as one recording:
 * how long all of it lasts, and how far into it `seconds` of `part` are.
 */
export const partsTime = (
  parts: ChapterEpisode[],
  part: ChapterEpisode | null,
  seconds: number,
): { elapsed: number; length: number } => {
  let length = 0
  let elapsed = 0
  for (const each of parts) {
    if (part && samePart(each, part)) {
      elapsed =
        length +
        Math.min(spanOf(each), Math.max(0, seconds - (each.start ?? 0)))
    }
    length += spanOf(each)
  }
  return { elapsed, length }
}

/** The part a time into the whole chapter falls in, and that part's second. */
const partAt = (
  parts: ChapterEpisode[],
  seconds: number,
): { index: number; at: number } | null => {
  let before = 0
  for (const [index, part] of parts.entries()) {
    const span = spanOf(part)
    if (seconds < before + span || index === parts.length - 1) {
      const into = Math.min(span, Math.max(0, seconds - before))
      // To the hundredth, as the API's times: Safari didn't start a stream at
      // "#t=811.5465695190429".
      return { index, at: Math.round(((part.start ?? 0) + into) * 100) / 100 }
    }
    before += span
  }
  return null
}

/**
 * Plays +365 podcast episodes (EJNS Portugal, a Bible-in-a-year reading),
 * streamed from the podcast's own host. One player for the whole app, so the
 * audio carries on while the reader turns chapters.
 */
@Injectable({ providedIn: "root" })
export class PodcastPlayerService {
  private http = inject(HttpClient)
  private readonly nativeChrome = inject(NativeChromeService)
  private audio?: HTMLAudioElement
  /**
   * A chapter read in parts, over several days' episodes (Salmo 119,
   * Provérbios 1–6), heard as one: all its parts, and a second element with
   * the next one loaded at its start, so it goes on without a gap.
   */
  private chain: ChapterEpisode[] = []
  private standby?: HTMLAudioElement
  /** Elements played within a tap: Safari lets them play later, from a timer. */
  private readonly unlocked = new WeakSet<HTMLAudioElement>()
  /** The part loaded on the standby element; none once it's emptied or swapped. */
  private standbyHolds?: ChapterEpisode

  /** The part after the one playing, in a chapter read in parts. */
  private nextPart(): ChapterEpisode | undefined {
    const index = this.chain.findIndex((part) => this.isCurrent(part))
    return index < 0 ? undefined : this.chain[index + 1]
  }

  /** In a chapter read in parts, where the player is in all of it. */
  private chainTime(
    seconds: number,
  ): { elapsed: number; length: number } | null {
    const current = this.current()
    // Not in a +365 day, which plays its episode through: a chapter's parts
    // left from before would send ±15 s or the lock screen to another day.
    if (
      this.throughEpisode() ||
      !current ||
      !this.chain.some((part) => samePart(part, current))
    ) {
      return null
    }
    return partsTime(this.chain, current, seconds)
  }

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
   * plays from where its chapter starts. `parts` are all of a chapter read
   * over several days, `episode` among them, played on as one. Chapters read
   * in one episode share its stream, so moving between them seeks instead of
   * reloading.
   */
  toggle(episode: ChapterEpisode, parts: ChapterEpisode[] = []): void {
    this.audio ??= this.createAudio()
    const audio = this.audio
    if (this.isCurrent(episode)) {
      if (this.playing()) {
        audio.pause()
        return
      }
      // Left by a +365 day (which plays its reading alone): from here, the
      // chapter's parts go on, the next one made ready within this tap.
      const adopted = this.adoptParts(parts)
      // Stopped at the chapter's end, play reads it again from the top. Not
      // in a +365 day, paused between two readings: it goes on to the next.
      if (
        episode.end != null &&
        audio.currentTime >= episode.end &&
        !this.throughEpisode()
      ) {
        // A chapter in parts, over: from its first part's top.
        const first = this.chain[0]
        if (first && !this.nextPart() && !samePart(first, episode)) {
          this.jumpTo(first, first.start ?? 0, true)
          return
        }
        audio.currentTime = episode.start ?? 0
      }
      this.play(audio, episode)
      // Unlocked within this tap: newly taken up, or made ready by a scrub
      // (jumpTo), outside any tap, which Safari won't let play on its own.
      // Or holding some other part (emptied by a +365 day since, say).
      const next = this.nextPart()
      const ready =
        !!this.standby &&
        this.unlocked.has(this.standby) &&
        !!this.standbyHolds &&
        !!next &&
        samePart(this.standbyHolds, next)
      if (next && (adopted || !ready)) this.prepare(next, true)
      return
    }
    const loaded =
      this.current()?.url === episode.url &&
      audio.readyState >= HTMLMediaElement.HAVE_METADATA
    this.current.set(episode)
    this.chain = parts
    if (loaded) {
      audio.currentTime = episode.start ?? 0
      // The seek lands with a later timeupdate; till then the last chapter's
      // place would show, clamped into this one's span.
      this.position.set(episode.start ?? 0)
    } else {
      // Reloading also replaces the fragment of a stream still loading, which
      // would otherwise win over a later chapter's start of zero.
      this.loadingAt = undefined
      audio.src = streamUrl(episode)
      // A new source resets the element's length and place without saying so:
      // the last episode's would otherwise stand until this one's load.
      this.duration.set(0)
      this.position.set(episode.start ?? 0)
    }
    this.play(audio, episode)
    // Within this tap: Safari lets an element play later only once it has.
    const next = this.nextPart()
    if (next) this.prepare(next, true)
    else this.emptyStandby()
  }

  /**
   * Moves to a time into the whole chapter, when it's read in parts: into
   * whichever part holds it. Otherwise a second of the episode, as seek().
   */
  seekChapter(seconds: number, parts: ChapterEpisode[] = []): void {
    this.adoptParts(parts)
    const place = partAt(this.chain, seconds)
    if (!place || !this.chainTime(0)) {
      this.seek(seconds)
      return
    }
    const part = this.chain[place.index]
    if (this.isCurrent(part)) this.seek(place.at)
    else this.jumpTo(part, place.at, this.playing())
  }

  /** Where a part loaded by jumpTo is to start, until its metadata comes. */
  private loadingAt?: number

  /**
   * Takes a chapter's parts as the ones in play when the part in the player
   * is among them and they aren't already; whether it did.
   */
  private adoptParts(parts: ChapterEpisode[]): boolean {
    const current = this.current()
    if (
      !current ||
      parts === this.chain ||
      !parts.some((part) => samePart(part, current)) ||
      (this.chain.length === parts.length &&
        this.chain.every((part, i) => samePart(part, parts[i])))
    ) {
      return false
    }
    this.chain = parts
    return true
  }

  /** Another part of the chapter, loaded at a second of it. */
  private jumpTo(part: ChapterEpisode, at: number, play: boolean): void {
    const audio = this.audio
    if (!audio) return
    this.clearEndTimer()
    this.current.set(part)
    // Only the fragment: a currentTime written while the new source loads is
    // what the guard would pull back.
    this.loadingAt = at
    reload(audio, `${part.url}#t=${at}`)
    this.duration.set(0)
    this.position.set(at)
    if (play) this.play(audio, part)
    const next = this.nextPart()
    if (next) this.prepare(next)
    else this.emptyStandby()
  }

  private readonly analytics = inject(AnalyticsService)

  constructor() {
    // Each start or resume of playback, with what plays.
    let wasPlaying = false
    effect(() => {
      const playing = this.playing()
      // A day let go while paused changes nothing else: "+365 · Dia N" goes.
      this.throughEpisode()
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
      // A day let go while paused changes nothing else: "+365 · Dia N" goes.
      this.throughEpisode()
      untracked(() =>
        playing ? keepAwake.start("podcast") : keepAwake.stop("podcast"),
      )
    })
    // The system's player (lock screen, menu bar, headphones) shows the part
    // being heard, the chapter or the reflection, not the whole episode.
    // Playing too: a pause that moves nothing else (before the stream loads,
    // a stalled one) left it showing ⏸.
    this.nativeChrome.actions$
      .pipe(takeUntilDestroyed())
      .subscribe((action) => this.onNativeMedia(action))
    effect(() => {
      const current = this.current()
      const position = this.position()
      const rate = this.rate()
      const duration = this.duration()
      const playing = this.playing()
      // A day let go while paused changes nothing else: "+365 · Dia N" goes.
      this.throughEpisode()
      untracked(() =>
        this.syncMediaSession(current, position, rate, duration, playing),
      )
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
    // A part jumped to and still loading: from where it is to start.
    const from =
      audio.readyState >= HTMLMediaElement.HAVE_METADATA
        ? audio.currentTime
        : (this.loadingAt ?? Math.max(current.start ?? 0, audio.currentTime))
    // A chapter in parts: on into the next part, or back into the one before.
    const whole = this.chainTime(from)
    if (whole) {
      this.seekChapter(
        Math.min(whole.length, Math.max(0, whole.elapsed + seconds)),
      )
      return
    }
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

  /** Where the part in the player stops, or goes on to the next part. */
  private endOfPart(): number | null | undefined {
    const end = this.current()?.end
    return end != null && this.nextPart() ? end + PART_TAIL : end
  }

  private guardChapter(audio: HTMLAudioElement): void {
    if (this.throughEpisode()) return
    const end = this.endOfPart()
    // Not while a part loads at its #t=: it reads 0 till then.
    if (
      this.loadingAt === undefined &&
      audio.currentTime < (this.current()?.start ?? 0)
    ) {
      audio.currentTime = this.withinChapter(audio.currentTime)
    }
    this.guardSkip(audio)
    if (end == null || !this.playing() || this.endTimer) return
    const left = (end - audio.currentTime) / audio.playbackRate
    if (left <= 0) this.stopAtEnd(audio)
    else if (left < 1) {
      this.endTimer = setTimeout(() => this.stopAtEnd(audio), left * 1000)
    }
  }

  /** Over the part's skip, to the millisecond as its end: not a word of it. */
  private skipTimer?: ReturnType<typeof setTimeout>

  private guardSkip(audio: HTMLAudioElement): void {
    const skip = this.current()?.skip
    if (!skip || !this.playing() || this.skipTimer) return
    const jump = () => {
      this.skipTimer = undefined
      const at = audio.currentTime
      if (at >= skip[0] - 0.05 && at < skip[1]) audio.currentTime = skip[1]
    }
    const left = (skip[0] - audio.currentTime) / audio.playbackRate
    if (left <= 0) jump()
    else if (left < 1) this.skipTimer = setTimeout(jump, left * 1000)
  }

  private stopAtEnd(audio: HTMLAudioElement): void {
    this.clearEndTimer()
    const end = this.endOfPart()
    if (end == null) return
    // Short of the end (the stream stalled, or the timer ran early): time the
    // rest again rather than cut it off.
    if (audio.currentTime < end - 0.02) {
      this.guardChapter(audio)
      return
    }
    const next = this.nextPart()
    if (
      next &&
      this.standby &&
      this.standbyHolds &&
      samePart(this.standbyHolds, next)
    ) {
      this.continueWith(next)
      return
    }
    // Not the next part on the standby (emptied since): loaded here, not
    // whatever it holds played on.
    if (next) {
      this.jumpTo(next, next.start ?? 0, true)
      return
    }
    audio.pause()
    audio.currentTime = end
    this.position.set(end)
  }

  /**
   * Loads a part on the standby element, at its start. `unlock` plays it
   * muted for a moment, within the user's tap, so it may play later.
   */
  private prepare(part: ChapterEpisode, unlock = false): void {
    this.standby ??= this.createAudio()
    const standby = this.standby
    standby.preload = "auto"
    standby.defaultPlaybackRate = this.rate()
    reload(standby, streamUrl(part))
    this.standbyHolds = part
    if (!unlock) return
    this.unlocked.add(standby)
    standby.muted = true
    const unmute = () => {
      standby.muted = false
    }
    standby.play().then(() => {
      if (standby !== this.audio) {
        standby.pause()
        standby.currentTime = part.start ?? 0
      }
      unmute()
    }, unmute)
  }

  private emptyStandby(): void {
    this.standby?.removeAttribute("src")
    this.standbyHolds = undefined
  }

  /** The next part, already loaded: the elements swap, with no pause between. */
  private continueWith(next: ChapterEpisode): void {
    const ending = this.audio
    const standby = this.standby
    if (!ending || !standby) return
    this.audio = standby
    this.standby = ending
    this.standbyHolds = undefined
    this.loadingAt = undefined
    this.current.set(next)
    this.duration.set(Number.isFinite(standby.duration) ? standby.duration : 0)
    this.position.set(next.start ?? 0)
    standby.playbackRate = this.rate()
    // Stopped before the next starts: started first, iOS let the jingle
    // after the ending part through for a moment.
    ending.pause()
    this.play(standby, next)
    // The system's player follows the element that played last: told of the
    // part again on the new one, or the lock screen loses it till the next.
    this.retellSession = true
    const after = this.nextPart()
    if (after) this.prepare(after)
  }

  /** The system's player told afresh, after the parts' elements swap. */
  private retellSession = false

  private clearEndTimer(): void {
    clearTimeout(this.endTimer)
    this.endTimer = undefined
    clearTimeout(this.skipTimer)
    this.skipTimer = undefined
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
    for (const audio of [this.audio, this.standby]) {
      if (!audio) continue
      // The default survives a new src, which resets playbackRate to it.
      audio.defaultPlaybackRate = next
      audio.playbackRate = next
    }
  }

  /** Moves the episode in the player to a second of it. */
  seek(seconds: number): void {
    if (!this.audio || !this.current()) return
    const within = this.withinChapter(seconds)
    this.audio.currentTime = within
    this.position.set(within)
    // A part still loading where jumpTo sent it: here instead, once loaded.
    if (this.loadingAt !== undefined) this.loadingAt = within
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
    playing: boolean,
  ): void {
    // Android's WebView has none: its shell shows the session (setMedia).
    const session =
      typeof navigator === "undefined" ? undefined : navigator.mediaSession
    // Ended or failed: nothing to show playing.
    if (!current) {
      this.nativeChrome.setMedia(null)
      if (session) {
        session.metadata = null
        session.playbackState = "none"
      }
      return
    }
    // A chapter is the Bible's; only a day of the plan is +365's.
    // An introduction (a fractional day in the data) is no «Dia»: just +365.
    const artist = this.throughEpisode()
      ? Number.isInteger(current.day)
        ? `+365 · Dia ${current.day}`
        : "+365"
      : "Bíblia Sagrada"
    if (session) session.playbackState = playing ? "playing" : "paused"
    if (
      session &&
      (this.retellSession ||
        session.metadata?.title !== current.title ||
        session.metadata?.artist !== artist)
    ) {
      this.retellSession = false
      session.metadata = new MediaMetadata({
        title: current.title,
        artist,
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
    // A chapter in parts, as one: all of it, not the part.
    const whole = this.chainTime(position)
    const span = whole ? whole.length : (current.end ?? duration) - start
    const at = whole ? whole.elapsed : position - start
    this.nativeChrome.setMedia({
      title: current.title,
      artist,
      playing,
      position: span > 0 ? Math.round(Math.min(span, Math.max(0, at))) : 0,
      duration: span > 0 ? Math.round(span) : 0,
      rate,
    })
    if (!session || !(span > 0)) return
    try {
      session.setPositionState({
        duration: span,
        position: Math.min(span, Math.max(0, at)),
        playbackRate: rate,
      })
    } catch {
      // Not every browser takes a position state; its own then shows.
    }
  }

  /** The system player's seek and skip, in the part's own time (a chapter's, read in parts). */
  private handleMediaSession(): void {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return
    const session = navigator.mediaSession
    for (const [action, handler] of this.mediaHandlers()) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // An action this browser doesn't know.
      }
    }
  }

  private mediaHandlers(): [MediaSessionAction, MediaSessionActionHandler][] {
    return [
      [
        "seekto",
        ({ seekTime }) => {
          if (seekTime == null) return
          if (this.chainTime(0)) this.seekChapter(seekTime)
          else this.seek((this.current()?.start ?? 0) + seekTime)
        },
      ],
      // Play and pause on the part playing: left to the browser, they could
      // reach the other element, loading the next part (the lock screen did).
      [
        "play",
        () => {
          const current = this.current()
          if (current && !this.playing()) this.toggle(current)
        },
      ],
      ["pause", () => this.pause()],
      // The app's own ±15 s where the system names no offset.
      ["seekbackward", ({ seekOffset }) => this.skip(-(seekOffset ?? 15))],
      ["seekforward", ({ seekOffset }) => this.skip(seekOffset ?? 15)],
    ]
  }

  /** The Android system's session (MediaChrome), asking as navigator.mediaSession does. */
  private onNativeMedia(action: NativeChromeAction): void {
    const handlers = new Map(this.mediaHandlers())
    const run = (name: MediaSessionAction, details?: object) =>
      handlers.get(name)?.({ action: name, ...details })
    if (action.id === "media-play") run("play")
    else if (action.id === "media-pause") run("pause")
    else if (action.id === "media-seek") {
      run("seekto", { seekTime: action.seconds })
    } else if (action.id === "media-skip") {
      run(action.seconds < 0 ? "seekbackward" : "seekforward", {
        seekOffset: Math.abs(action.seconds),
      })
    }
  }

  private createAudio(): HTMLAudioElement {
    this.handleMediaSession()
    const audio = new Audio()
    // The standby element never sounds: iOS once resumed it on its own, with
    // the part after next, over the one playing. Muted, it is being unlocked.
    audio.addEventListener("playing", () => {
      if (audio !== this.audio && !audio.muted) audio.pause()
    })
    // Only the element playing speaks for the player: not the standby one,
    // loading the next part (or unlocked, muted, for it).
    const on = (type: string, listener: () => void) =>
      audio.addEventListener(type, () => {
        if (audio === this.audio) listener()
      })
    audio.preload = "none"
    audio.defaultPlaybackRate = this.rate()
    on("play", () => this.playing.set(true))
    on("pause", () => {
      this.clearEndTimer()
      this.playing.set(false)
    })
    // A move or a new speed changes when the end comes: time it afresh.
    on("seeking", () => this.clearEndTimer())
    on("ratechange", () => {
      this.clearEndTimer()
      // A new speed brings the end sooner or later: time it at once, as the
      // next timeupdate may only come after it.
      this.guardChapter(audio)
    })
    on("timeupdate", () => {
      // A new source's load reports 0:00 before its #t= start applies: not a
      // place to follow (the reader would turn to the day's first reading).
      const loading = audio.readyState < HTMLMediaElement.HAVE_METADATA
      if (!loading || audio.currentTime >= (this.current()?.start ?? 0)) {
        this.position.set(audio.currentTime)
      }
      this.guardChapter(audio)
    })
    // A part jumped to: there, should the browser have ignored its #t=.
    on("loadedmetadata", () => {
      const at = this.loadingAt
      this.loadingAt = undefined
      if (at !== undefined && Math.abs(audio.currentTime - at) > 0.5) {
        audio.currentTime = at
      }
    })
    // A live or unknown length reads Infinity or NaN: no position to pick.
    on("durationchange", () =>
      this.duration.set(Number.isFinite(audio.duration) ? audio.duration : 0),
    )
    // A stream that ended or failed is not resumed: play() would restart an
    // ended one at 0:00 and keep failing on a broken load.
    on("ended", () => this.forget())
    on("error", () => this.forget())
    return audio
  }
}
