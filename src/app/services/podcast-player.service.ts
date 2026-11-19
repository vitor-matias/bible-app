import { HttpClient } from "@angular/common/http"
import { Injectable, inject, signal } from "@angular/core"
import { catchError, map, type Observable, of } from "rxjs"
import { apiBaseUrl } from "../config"

/** A +365 episode that reads a chapter, as bible-api's /audio lists it. */
export interface ChapterEpisode {
  day: number
  title: string
  url: string
  /** Seconds where the chapter's reading starts; null plays from the top. */
  start: number | null
}

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
      if (this.playing()) audio.pause()
      else void audio.play()
      return
    }
    const sameStream = this.current()?.url === episode.url
    this.current.set(episode)
    if (sameStream) {
      audio.currentTime = episode.start ?? 0
    } else {
      // A media fragment makes the browser start there once the stream loads.
      audio.src = episode.start
        ? `${episode.url}#t=${episode.start}`
        : episode.url
    }
    void audio.play()
  }

  private createAudio(): HTMLAudioElement {
    const audio = new Audio()
    audio.preload = "none"
    audio.addEventListener("play", () => this.playing.set(true))
    audio.addEventListener("pause", () => this.playing.set(false))
    audio.addEventListener("ended", () => this.playing.set(false))
    return audio
  }
}
