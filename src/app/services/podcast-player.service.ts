import { HttpClient } from "@angular/common/http"
import { Injectable, inject, signal } from "@angular/core"
import { catchError, map, type Observable, of } from "rxjs"
import { apiBaseUrl } from "../config"
import { TEST_EPISODES } from "./podcast-test-episodes"

/** A +365 episode that reads a chapter, as bible-api's /audio lists it. */
export interface ChapterEpisode {
  day: number
  title: string
  url: string
  /** Seconds where the chapter's reading starts; null plays from the top. */
  start: number | null
}

const RATES = [1, 1.25, 1.5, 2, 0.75]

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

  /** The episodes that read a chapter, earliest day first; [] when none. */
  episodesFor(bookId: string, chapter: number): Observable<ChapterEpisode[]> {
    const hardcoded = TEST_EPISODES[`${bookId}/${chapter}`]
    if (hardcoded) return of(hardcoded)
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
      if (this.playing()) audio.pause()
      else this.play(audio, episode)
      return
    }
    const loaded =
      this.current()?.url === episode.url &&
      audio.readyState >= HTMLMediaElement.HAVE_METADATA
    this.current.set(episode)
    if (loaded) {
      audio.currentTime = episode.start ?? 0
    } else {
      // A media fragment makes the browser start there once the stream loads.
      // Reloading also replaces the fragment of a stream still loading, which
      // would otherwise win over a later chapter's start of zero.
      audio.src = episode.start
        ? `${episode.url}#t=${episode.start}`
        : episode.url
    }
    this.play(audio, episode)
  }

  /** Moves the playing episode back (negative) or forward, in seconds. */
  skip(seconds: number): void {
    const audio = this.audio
    if (!audio || !this.current()) return
    audio.currentTime = Math.max(0, audio.currentTime + seconds)
  }

  /** Moves to the next playback speed, after the last back to the first. */
  nextRate(): void {
    const next = RATES[(RATES.indexOf(this.rate()) + 1) % RATES.length]
    this.rate.set(next)
    if (this.audio) {
      // The default survives a new src, which resets playbackRate to it.
      this.audio.defaultPlaybackRate = next
      this.audio.playbackRate = next
    }
  }

  private play(audio: HTMLAudioElement, episode: ChapterEpisode): void {
    audio.play().catch(() => {
      // Only this entry's failure: switching streams aborts the last play().
      if (this.isCurrent(episode)) this.forget()
    })
  }

  /** Lets the next touch load the chapter afresh, from its start. */
  private forget(): void {
    this.playing.set(false)
    this.current.set(null)
  }

  private createAudio(): HTMLAudioElement {
    const audio = new Audio()
    audio.preload = "none"
    audio.defaultPlaybackRate = this.rate()
    audio.addEventListener("play", () => this.playing.set(true))
    audio.addEventListener("pause", () => this.playing.set(false))
    // A stream that ended or failed is not resumed: play() would restart an
    // ended one at 0:00 and keep failing on a broken load.
    audio.addEventListener("ended", () => this.forget())
    audio.addEventListener("error", () => this.forget())
    return audio
  }
}
