import { provideHttpClient } from "@angular/common/http"
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { apiBaseUrl } from "../../config"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BookService } from "../../services/book.service"
import { KeepAwakeService } from "../../services/keep-awake.service"
import { Mais365Service } from "../../services/mais365.service"
import {
  type ChapterEpisode,
  PodcastPlayerService,
} from "../../services/podcast-player.service"
import { lastCall } from "../../testing/spy-obj"
import { AutoScrollControlsComponent } from "./auto-scroll-controls.component"

const day3: ChapterEpisode = {
  day: 3,
  title: "Dia 3 - A Arca de Noé",
  url: "https://anchor.fm/s/x/podcast/play/3.m4a",
  start: 56.5,
  end: 280.8,
}
const genesis6 = { ...day3, start: 280.8, end: 492.1 }

/** The floating control in its +365 mode: one control, scroll or listen. */
describe("AutoScrollControlsComponent +365 mode", () => {
  let fixture: ComponentFixture<AutoScrollControlsComponent>
  let http: HttpTestingController
  let play: ReturnType<typeof vi.spyOn>

  // The episodes request holds the fixture unstable until answer() flushes it.
  const render = (bookId: string, chapter: number) => {
    fixture.componentRef.setInput("bookId", bookId)
    fixture.componentRef.setInput("chapter", chapter)
    fixture.componentRef.setInput(
      "bookName",
      bookId === "exo" ? "Êxodo" : "Génesis",
    )
    fixture.detectChanges()
  }
  const answer = async (episodes: ChapterEpisode[] | null, chapter = 5) => {
    const request = http.expectOne(`${apiBaseUrl}/audio/exo/${chapter}`)
    if (episodes) request.flush({ episodes })
    else
      request.flush(
        { error: "Audio not found" },
        { status: 404, statusText: "Not Found" },
      )
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const find = (selector: string) =>
    fixture.nativeElement.querySelector(selector) as HTMLButtonElement | null
  const byLabel = (label: string) => find(`button[aria-label="${label}"]`)
  const modeToggle = () => find("button.mode-toggle")
  const toggle = () => find("button.auto-scroll-toggle")
  const tap = (button: HTMLButtonElement | null) => {
    button?.click()
    fixture.detectChanges()
  }
  const listen = async (episodes: ChapterEpisode[] = [day3]) => {
    render("exo", 5)
    await answer(episodes)
    tap(modeToggle())
  }
  const audio = () => play.mock.contexts.at(-1) as HTMLAudioElement

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AnalyticsService, useValue: { track: vi.fn() } },
        // The plan's links ask it for a book's address; no book list here.
        { provide: BookService, useValue: { findBookById: () => undefined } },
      ],
    })
    http = TestBed.inject(HttpTestingController)
    // No real stream: playing and pausing report it, and paused follows them,
    // so an assertion on paused fails when a pause goes missing.
    const sounding = new WeakSet<HTMLMediaElement>()
    vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(
      function (this: HTMLMediaElement) {
        return !sounding.has(this)
      },
    )
    play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function (this: HTMLMediaElement) {
        sounding.add(this)
        this.dispatchEvent(new Event("play"))
        return Promise.resolve()
      })
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      sounding.delete(this)
      this.dispatchEvent(new Event("pause"))
    })
    fixture = TestBed.createComponent(AutoScrollControlsComponent)
  })

  afterEach(() => http.verify())

  it("offers no +365 mode for a chapter no episode reads", async () => {
    render("exo", 5)
    await answer(null)
    expect(modeToggle()).toBeNull()
  })

  it("offers no +365 mode when the request fails", async () => {
    render("exo", 5)
    http
      .expectOne(`${apiBaseUrl}/audio/exo/5`)
      .flush("boom", { status: 500, statusText: "Server Error" })
    await fixture.whenStable()
    fixture.detectChanges()
    expect(modeToggle()).toBeNull()
  })

  it("plays the episode from where the chapter starts with the same play button", async () => {
    await listen([day3, { ...day3, day: 40 }])
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")

    tap(toggle())

    expect(play).toHaveBeenCalledTimes(1)
    expect(audio().src).toBe(`${day3.url}#t=56.5`)
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
  })

  it("pauses and resumes on the next touches", async () => {
    await listen()
    tap(toggle())
    tap(toggle())
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")

    tap(toggle())
    expect(play).toHaveBeenCalledTimes(2)
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
  })

  it("stops scrolling to listen, and pauses the episode to scroll again", async () => {
    const autoScroll = TestBed.inject(AutoScrollService)
    const stop = vi.spyOn(autoScroll, "stop")
    autoScroll.autoScrollEnabled = true
    render("exo", 5)
    await answer([day3])
    tap(modeToggle())
    expect(stop).toHaveBeenCalled()

    tap(toggle())
    tap(modeToggle())
    expect(audio().paused).toBe(true)
    expect(toggle()?.getAttribute("aria-label")).toBe(
      "Ativar deslocamento automático",
    )
  })

  it("plays from the top when the episode has no start", async () => {
    await listen([{ ...day3, start: null }])
    tap(toggle())
    expect(audio().src).toBe(day3.url)
  })

  it("skips 10 s back and forward once the chapter is in the player", async () => {
    await listen()
    expect(byLabel("Recuar 10 segundos")?.disabled).toBe(true)

    tap(toggle())
    const stream = audio()
    Object.defineProperty(stream, "readyState", {
      value: HTMLMediaElement.HAVE_METADATA,
    })
    stream.currentTime = 100
    tap(byLabel("Avançar 10 segundos"))
    expect(stream.currentTime).toBe(110)
    tap(byLabel("Recuar 10 segundos"))
    tap(byLabel("Recuar 10 segundos"))
    expect(stream.currentTime).toBe(90)
  })

  it("steps the speed between 0,75× and 2× with − and +", async () => {
    await listen()
    tap(toggle())
    const slower = () => byLabel("Diminuir velocidade do +365")
    const faster = () => byLabel("Aumentar velocidade do +365")
    const label = () => find(".rate")?.textContent?.trim()
    expect(label()).toBe("1 vez")

    tap(faster())
    expect(audio().playbackRate).toBe(1.25)
    expect(label()).toBe("1,25 vezes")
    tap(faster())
    tap(faster())
    expect(label()).toBe("2 vezes")
    expect(faster()?.disabled).toBe(true)

    for (let i = 0; i < 4; i++) tap(slower())
    expect(label()).toBe("0,75 vezes")
    expect(slower()?.disabled).toBe(true)
  })

  it("seeks within the episode for the next chapter it reads", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    // As if the stream had loaded far enough to seek.
    Object.defineProperty(stream, "readyState", {
      value: HTMLMediaElement.HAVE_METADATA,
    })

    render("exo", 6)
    await answer([genesis6], 6)
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
    tap(toggle())

    expect(audio()).toBe(stream)
    expect(stream.src).toBe(`${day3.url}#t=56.5`)
    expect(stream.currentTime).toBe(280.8)
  })

  it("shows the earlier chapter's start at once when moving back within the episode", async () => {
    render("exo", 6)
    await answer([genesis6], 6)
    tap(modeToggle())
    tap(toggle())
    const stream = audio()
    Object.defineProperty(stream, "readyState", {
      value: HTMLMediaElement.HAVE_METADATA,
    })
    stream.currentTime = 450
    stream.dispatchEvent(new Event("timeupdate"))

    render("exo", 5)
    await answer([day3])
    tap(toggle())
    fixture.detectChanges()
    // No timeupdate yet: the seek hasn't landed.
    expect(find(".audio-time")?.textContent?.trim()).toBe("0:00")
  })

  it("restarts a stream still loading at the next chapter's start, even zero", async () => {
    await listen()
    tap(toggle())

    render("exo", 6)
    await answer([{ ...day3, start: null }], 6)
    tap(toggle())

    expect(audio().src).toBe(day3.url)
  })

  it("replays an ended episode from the chapter's start, not 0:00", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    stream.src = "about:blank"
    stream.dispatchEvent(new Event("ended"))
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")

    tap(toggle())
    expect(stream.src).toBe(`${day3.url}#t=56.5`)
  })

  it("offers to play again, reloading, when the stream fails", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    stream.src = "about:blank"
    stream.dispatchEvent(new Event("error"))
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")

    tap(toggle())
    expect(stream.src).toBe(`${day3.url}#t=56.5`)
  })

  it("offers to play again when play() is refused", async () => {
    play.mockImplementation(() => Promise.reject(new Error("NotAllowedError")))
    await listen()
    tap(toggle())
    await fixture.whenStable()
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
  })

  it("resumes, not restarts, when paused while the stream still loads", async () => {
    let reject: (error: unknown) => void = () => {}
    play.mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"))
      return new Promise<void>((_, no) => {
        reject = no
      })
    })
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      reject(new DOMException("", "AbortError"))
      this.dispatchEvent(new Event("pause"))
    })
    await listen()
    tap(toggle())
    const stream = audio()
    tap(toggle())
    await fixture.whenStable()
    fixture.detectChanges()
    expect(byLabel("Avançar 10 segundos")?.disabled).toBe(false)

    stream.src = "about:blank"
    tap(toggle())
    expect(stream.src).toBe("about:blank")
  })

  it("skips from the chapter's start while the stream still loads", async () => {
    await listen()
    tap(toggle())
    tap(byLabel("Avançar 10 segundos"))
    expect(audio().currentTime).toBe(66.5)
  })

  it("stops playing when the chapter changes", async () => {
    await listen()
    tap(toggle())
    const stream = audio()

    render("exo", 7)
    await answer(null, 7)
    expect(stream.paused).toBe(true)
    expect(toggle()?.getAttribute("aria-label")).toBe(
      "Ativar deslocamento automático",
    )
  })

  it("pauses the episode when the controls are hidden", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    fixture.destroy()
    expect(stream.paused).toBe(true)
  })

  it("shows the system's player the chapter's own time, and seeks within it", async () => {
    const position = vi.spyOn(navigator.mediaSession, "setPositionState")
    const handlers = new Map<string, MediaSessionActionHandler | null>()
    vi.spyOn(navigator.mediaSession, "setActionHandler").mockImplementation(
      (action, handler) => void handlers.set(action, handler),
    )
    await listen()
    tap(toggle())
    const stream = audio()
    stream.currentTime = 200
    stream.dispatchEvent(new Event("timeupdate"))
    TestBed.tick()
    // Génesis 6: 56.5 to 280.8 in the episode.
    expect(lastCall(position)[0]).toEqual({
      duration: 280.8 - 56.5,
      position: 200 - 56.5,
      playbackRate: 1,
    })
    expect(navigator.mediaSession.metadata?.title).toBe("Êxodo 5")

    handlers.get("seekto")?.({ action: "seekto", seekTime: 30 })
    expect(stream.currentTime).toBe(86.5)
  })

  it("says the day and the reading's place in it, and steps through its readings", async () => {
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true)
    // As Mais365Service.start() sets it: the day plays through its chapters.
    TestBed.inject(PodcastPlayerService).throughEpisode.set(true)
    await listen()
    tap(toggle())
    expect(find(".audio-caption")?.textContent?.trim()).toBe("Êxodo 5")
    const reading = (chapter: number, start: number) => ({
      bookId: "exo",
      bookName: "Êxodo",
      chapter,
      episode: { ...day3, start },
    })
    TestBed.inject(Mais365Service).active.set({
      day: 3,
      title: "A Arca de Noé",
      theme: "A Arca de Noé",
      url: day3.url,
      duration: 1103,
      readings: [reading(4, 0), reading(5, 56.5), reading(6, 280.8)],
      reflection: 900,
    })
    const stream = audio()
    stream.currentTime = 60
    stream.dispatchEvent(new Event("timeupdate"))
    TestBed.tick()
    fixture.detectChanges()
    expect(find(".audio-caption")?.textContent?.trim()).toBe(
      "+365 · Dia 3 · Êxodo 5",
    )
    // Stepping through the day's readings, in place of the mode switch.
    expect(modeToggle()).toBeNull()
    tap(byLabel("Saltar para Êxodo 6"))
    expect(stream.currentTime).toBe(280.8)
    TestBed.tick()
    expect(lastCall(navigate)[0]).toEqual(["/", "exo", 6])
    fixture.detectChanges()
    // Still on Êxodo 5 (the stubbed router turned nothing): the card plays
    // and names the reading heard, and marks nothing in the chapter open.
    expect(find(".audio-caption")?.textContent?.trim()).toBe(
      "+365 · Dia 3 · Êxodo 6",
    )
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
    expect(byLabel("Recuar 10 segundos")?.disabled).toBe(false)
    expect(
      (
        fixture.componentInstance as unknown as { heardHere: () => boolean }
      ).heardHere(),
    ).toBe(false)
    tap(toggle())
    expect(stream.paused).toBe(true)
    expect(stream.currentTime).toBe(280.8)
    tap(toggle())
    tap(byLabel("Voltar a Êxodo 5"))
    expect(stream.currentTime).toBe(56.5)
  })

  it("keeps the screen on while +365 plays", async () => {
    const keepAwake = TestBed.inject(KeepAwakeService)
    const start = vi.spyOn(keepAwake, "start")
    const stop = vi.spyOn(keepAwake, "stop")
    await listen()
    tap(toggle())
    TestBed.tick()
    expect(start).toHaveBeenLastCalledWith("podcast")
    tap(toggle())
    TestBed.tick()
    expect(stop).toHaveBeenLastCalledWith("podcast")
  })

  it("holds for a footnote, resuming once the last one lets go", async () => {
    const player = TestBed.inject(PodcastPlayerService)
    await listen()
    tap(toggle())
    const stream = audio()
    const first = player.hold()
    expect(stream.paused).toBe(true)
    // One note to the next: the first closes as the second opens.
    const second = player.hold()
    first()
    expect(stream.paused).toBe(true)
    second()
    expect(stream.paused).toBe(false)

    const followed = player.hold()
    followed(false)
    expect(stream.paused).toBe(true)
  })

  it("leaves a paused episode paused after a footnote", async () => {
    const player = TestBed.inject(PodcastPlayerService)
    await listen()
    tap(toggle())
    tap(toggle())
    player.hold()()
    expect(audio().paused).toBe(true)
  })

  it("plays a day's reflection from any chapter, with ⏭ kept but disabled", async () => {
    vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true)
    TestBed.inject(PodcastPlayerService).throughEpisode.set(true)
    await listen()
    tap(toggle())
    TestBed.inject(Mais365Service).active.set({
      day: 3,
      title: "A Arca de Noé",
      theme: "A Arca de Noé",
      url: day3.url,
      duration: 1103,
      readings: [
        { bookId: "exo", bookName: "Êxodo", chapter: 5, episode: day3 },
      ],
      reflection: 900,
    })
    const stream = audio()
    stream.currentTime = 950
    stream.dispatchEvent(new Event("timeupdate"))
    TestBed.tick()
    fixture.detectChanges()
    expect(find(".audio-caption")?.textContent?.trim()).toBe(
      "+365 · Dia 3 · Reflexão",
    )
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
    expect(find("button.plan-skip")?.disabled).toBe(true)
    expect(byLabel("Voltar a Êxodo 5")).toBeTruthy()

    // Back 10 s near its start stays in the reflection.
    stream.currentTime = 905
    stream.dispatchEvent(new Event("timeupdate"))
    tap(byLabel("Recuar 10 segundos"))
    expect(stream.currentTime).toBe(900)
  })

  it("names an introduction as itself, not a reflection of a «Dia 6.5»", async () => {
    vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true)
    TestBed.inject(PodcastPlayerService).throughEpisode.set(true)
    await listen()
    tap(toggle())
    TestBed.inject(Mais365Service).active.set({
      day: 6.5,
      title: "Introdução aos Patriarcas",
      theme: "Introdução aos Patriarcas",
      url: day3.url,
      duration: 2631,
      readings: [],
      reflection: 0,
    })
    TestBed.tick()
    fixture.detectChanges()
    expect(find(".audio-caption")?.textContent?.trim()).toBe(
      "+365 · Introdução aos Patriarcas",
    )
  })

  it("plays on across chapters and when hidden in a +365 day", async () => {
    TestBed.inject(PodcastPlayerService).throughEpisode.set(true)
    await listen()
    tap(toggle())
    const stream = audio()
    // Past the chapter's end (280.8), on into the next reading.
    stream.currentTime = 290
    stream.dispatchEvent(new Event("timeupdate"))
    fixture.detectChanges()
    expect(stream.paused).toBe(false)
    expect(stream.currentTime).toBe(290)

    // Paused between two readings, play goes on rather than back to the top.
    tap(toggle())
    tap(toggle())
    expect(stream.currentTime).toBe(290)

    render("exo", 7)
    await answer(null, 7)
    expect(stream.paused).toBe(false)
    fixture.destroy()
    expect(stream.paused).toBe(false)
  })

  it("stops scrolling when it comes back to «Ouvir» by turning chapters", async () => {
    const autoScroll = TestBed.inject(AutoScrollService)
    const stop = vi.spyOn(autoScroll, "stop")
    await listen()
    render("exo", 6)
    await answer(null, 6)
    expect(toggle()?.getAttribute("aria-label")).toBe(
      "Ativar deslocamento automático",
    )
    autoScroll.autoScrollEnabled = true
    stop.mockClear()

    render("exo", 5)
    await answer([day3])
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
    expect(stop).toHaveBeenCalled()
  })

  it("pauses where the chapter's reading ends, and plays it again from its start", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    stream.currentTime = 200
    stream.dispatchEvent(new Event("timeupdate"))
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")

    stream.currentTime = 281
    stream.dispatchEvent(new Event("timeupdate"))
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
    expect(stream.currentTime).toBe(280.8)

    tap(toggle())
    expect(stream.currentTime).toBe(56.5)
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
  })

  it("stops on the chapter's last millisecond, not at the next timeupdate", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    vi.useFakeTimers()
    stream.currentTime = 280.6
    stream.dispatchEvent(new Event("timeupdate"))
    await vi.advanceTimersByTimeAsync(150)
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")

    // Played on with no timeupdate yet, as between two of them.
    stream.currentTime = 280.79
    await vi.advanceTimersByTimeAsync(100)
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
    expect(stream.currentTime).toBe(280.8)
  })

  it("plays the rest of the chapter when the stream stalls near its end", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    vi.useFakeTimers()
    stream.currentTime = 280.6
    stream.dispatchEvent(new Event("timeupdate"))
    // Stalled: the clock runs, the stream doesn't.
    await vi.advanceTimersByTimeAsync(400)
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
    expect(stream.currentTime).toBe(280.6)

    stream.currentTime = 280.79
    await vi.advanceTimersByTimeAsync(400)
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
    expect(stream.currentTime).toBe(280.8)
  })

  it("keeps the card, disabled, while the next chapter's episode is looked up", async () => {
    await listen()
    render("exo", 6)
    expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
    expect(toggle()?.disabled).toBe(true)
    expect(find(".audio-caption")?.textContent?.trim()).toBe("Êxodo 6")

    await answer([genesis6], 6)
    expect(toggle()?.disabled).toBe(false)
  })

  it("keeps back and forward inside the chapter", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    Object.defineProperty(stream, "readyState", {
      value: HTMLMediaElement.HAVE_METADATA,
    })
    stream.currentTime = 275
    tap(byLabel("Avançar 10 segundos"))
    expect(stream.currentTime).toBe(280.8)

    stream.currentTime = 60
    tap(byLabel("Recuar 10 segundos"))
    expect(stream.currentTime).toBe(56.5)
  })

  it("brings a stream that starts before the chapter to its start", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    stream.currentTime = 10
    stream.dispatchEvent(new Event("timeupdate"))
    expect(stream.currentTime).toBe(56.5)
  })

  it("plays on through the episode when the chapter's end is unknown", async () => {
    await listen([{ ...day3, end: null }])
    tap(toggle())
    const stream = audio()
    stream.currentTime = 900
    stream.dispatchEvent(new Event("timeupdate"))
    fixture.detectChanges()
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
  })

  it("shows a chapter not in the player at its start, not another's progress", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    stream.currentTime = 200
    stream.dispatchEvent(new Event("timeupdate"))

    render("exo", 6)
    await answer(
      [
        {
          ...day3,
          url: "https://anchor.fm/s/x/podcast/play/9.m4a",
          start: 10,
          end: 100,
        },
      ],
      6,
    )
    expect(find(".audio-time")?.textContent?.trim()).toBe("0:00")
    expect(
      (find('input[aria-label="Posição no +365"]') as HTMLInputElement | null)
        ?.value,
    ).toBe("10")
  })

  it("forgets the last episode's length when another loads", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    Object.defineProperty(stream, "duration", {
      value: 1103,
      configurable: true,
    })
    stream.dispatchEvent(new Event("durationchange"))

    render("exo", 6)
    await answer(
      [{ ...day3, url: "https://anchor.fm/s/x/podcast/play/9.m4a", end: null }],
      6,
    )
    tap(toggle())
    expect(
      (find('input[aria-label="Posição no +365"]') as HTMLInputElement | null)
        ?.disabled,
    ).toBe(true)
  })

  it("adds up skips made before the stream loads", async () => {
    await listen()
    tap(toggle())
    tap(byLabel("Avançar 10 segundos"))
    tap(byLabel("Avançar 10 segundos"))
    expect(audio().currentTime).toBe(76.5)
  })

  it("times the chapter's end again when the speed changes near it", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    vi.useFakeTimers()
    stream.currentTime = 280.6
    stream.dispatchEvent(new Event("timeupdate"))
    tap(byLabel("Aumentar velocidade do +365"))
    stream.currentTime = 280.79
    await vi.advanceTimersByTimeAsync(300)
    fixture.detectChanges()
    expect(stream.paused).toBe(true)
    expect(stream.currentTime).toBe(280.8)
  })

  describe("read-along", () => {
    const withVerses: ChapterEpisode = {
      ...day3,
      verses: [
        [1, 58],
        [2, 64],
        [3, 70],
      ],
    }
    let read: (number | null)[]
    const at = (seconds: number) => {
      const stream = audio()
      stream.currentTime = seconds
      stream.dispatchEvent(new Event("timeupdate"))
      fixture.detectChanges()
    }

    beforeEach(() => {
      read = []
      fixture.componentInstance.readingVerse.subscribe((verse) =>
        read.push(verse),
      )
    })

    it("tells the reader each verse as the reading reaches it", async () => {
      await listen([withVerses])
      tap(toggle())
      at(57)
      at(59)
      at(65)
      at(71)
      expect(read.filter((verse) => verse !== null)).toEqual([1, 2, 3])
    })

    it("moves the mark on a moment before the verse is heard", async () => {
      await listen([withVerses])
      tap(toggle())
      at(63.5)
      expect(read.at(-1)).toBe(1)
      // Verse 2 is timed at 64: its mark is on by 63.7.
      at(63.7)
      expect(read.at(-1)).toBe(2)
    })

    describe("glide", () => {
      let page: HTMLElement

      // A 300px window on three 200px verses; nothing covers it.
      beforeEach(() => {
        page = document.createElement("div")
        page.style.cssText =
          "position:fixed;top:0;left:0;width:300px;height:300px;overflow:auto"
        const text = document.createElement("div")
        for (const number of [1, 2, 3]) {
          const verse = document.createElement("div")
          verse.id = String(number)
          verse.style.height = "200px"
          text.append(verse)
        }
        page.append(
          text,
          Object.assign(document.createElement("div"), {
            style: "height:600px",
          }),
        )
        document.body.append(page)
        fixture.componentRef.setInput("scrollElement", page)
        fixture.componentRef.setInput("lineHeightElement", text)
      })
      afterEach(() => page.remove())

      const playAt = async (seconds: number) => {
        await listen([{ ...withVerses, end: 76 }])
        vi.useFakeTimers({
          toFake: ["requestAnimationFrame", "cancelAnimationFrame", "Date"],
        })
        tap(toggle())
        audio().currentTime = seconds
      }

      // The reading area: the middle 75% of 300px, from 37.5 to 262.5.
      it("leaves the text still while the verse is wholly in the reading area", async () => {
        page.querySelectorAll<HTMLElement>("[id]").forEach((verse) => {
          verse.style.height = "100px"
        })
        // Half through verse 2, at 100 to 200px: inside the area.
        await playAt(67)
        vi.advanceTimersByTime(3000)
        expect(page.scrollTop).toBe(0)
      })

      it("eases a verse that leaves the area up to its top edge, then rests", async () => {
        // Verse 2 at 200 to 400px runs out of the area: its top goes to 37.5.
        await playAt(67)
        // Slowly: gathering speed over the first second...
        vi.advanceTimersByTime(1000)
        const early = page.scrollTop
        expect(early).toBeGreaterThan(5)
        expect(early).toBeLessThan(35)
        // ...and never faster than 45px a second.
        vi.advanceTimersByTime(2000)
        expect(page.scrollTop - early).toBeLessThanOrEqual(91)
        // A short landing: settled within 7 s in all.
        vi.advanceTimersByTime(4000)
        // Whole pixels, and it rests within one of the edge.
        expect(Math.abs(page.scrollTop - 162.5)).toBeLessThanOrEqual(1.5)
        const rested = page.scrollTop
        vi.advanceTimersByTime(2000)
        expect(page.scrollTop).toBe(rested)
      })

      it("once slowing down, lands where it was headed and rests, whatever the reading does", async () => {
        await playAt(67)
        // Into its slowdown, 45px short of 162.5.
        vi.advanceTimersByTime(3600)
        const a = page.scrollTop
        vi.advanceTimersByTime(250)
        const before = page.scrollTop - a
        // The reading moves on to verse 3, 200px further down.
        audio().currentTime = 71
        vi.advanceTimersByTime(250)
        const after = page.scrollTop - (a + before)
        expect(after).toBeLessThanOrEqual(before + 1)
        // It lands where it was headed: still from there, half a second on.
        let landed = Number.NaN
        for (let waited = 0; waited < 6000; waited += 500) {
          landed = page.scrollTop
          vi.advanceTimersByTime(500)
          if (page.scrollTop === landed) break
        }
        expect(Math.abs(landed - 162.5)).toBeLessThanOrEqual(1.5)
        // Then still for a while (3 s), though verse 3 runs out of the area.
        vi.advanceTimersByTime(2000)
        expect(page.scrollTop).toBe(landed)
      })

      it("leaves the text alone for a while after the reader moves it", async () => {
        await playAt(67)
        page.dispatchEvent(new WheelEvent("wheel"))
        vi.advanceTimersByTime(4000)
        expect(page.scrollTop).toBe(0)
        vi.advanceTimersByTime(26000)
        expect(Math.abs(page.scrollTop - 162.5)).toBeLessThanOrEqual(1.5)
      })

      it("reads below a card dragged up over the text's top", async () => {
        await playAt(67)
        // The card over the page's top 106px: the area is 130.25 to 275.75.
        vi.spyOn(
          find(".audio-player") as HTMLElement,
          "getBoundingClientRect",
        ).mockReturnValue(new DOMRect(0, 0, 300, 106))
        // Verse 2 (200px) is taller than the area: its reading line, 300px
        // into the text, eases to the area's top.
        vi.advanceTimersByTime(20000)
        expect(Math.abs(page.scrollTop - 169.75)).toBeLessThanOrEqual(1.5)
      })

      it("carries no movement the top of the page refused", async () => {
        // Verse 1 starts at the very top: above the area, with nowhere to go.
        await playAt(58.5)
        vi.advanceTimersByTime(2000)
        expect(page.scrollTop).toBe(0)
        expect(
          Math.abs(
            (fixture.componentInstance as unknown as { glideCarry: number })
              .glideCarry,
          ),
        ).toBeLessThan(1)
      })

      it("stands back when the reader turns a page with a ‹ › arrow, by keyboard too", async () => {
        const arrow = document.createElement("button")
        arrow.className = "floating-nav-button next-chapter"
        document.body.append(arrow)
        try {
          await playAt(67)
          // Enter or Space on a button is a click without a pointerdown.
          arrow.click()
          vi.advanceTimersByTime(4000)
          expect(page.scrollTop).toBe(0)
        } finally {
          arrow.remove()
        }
      })

      it("keeps following through keys on the card's own controls", async () => {
        await playAt(67)
        toggle()?.dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true }),
        )
        find('input[aria-label="Posição no +365"]')?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        )
        vi.advanceTimersByTime(8000)
        expect(page.scrollTop).toBeGreaterThan(100)
      })

      it("stands back when the reader takes the scrollbar", async () => {
        await playAt(67)
        page.dispatchEvent(new PointerEvent("pointerdown"))
        vi.advanceTimersByTime(4000)
        expect(page.scrollTop).toBe(0)
      })

      describe("in pages", () => {
        let turns: ("next" | HTMLElement)[]
        // Verse 2 as column fragments: `here` px on this page, `after` on the next.
        const split = (here: number, after: number) => {
          const verse = page.querySelector('[id="2"]') as HTMLElement
          const parts = [
            new DOMRect(10, 0, 200, here),
            ...(after
              ? [new DOMRect(window.innerWidth + 10, 0, 200, after)]
              : []),
          ]
          vi.spyOn(verse, "getClientRects").mockReturnValue(
            parts as unknown as DOMRectList,
          )
          return verse
        }

        beforeEach(() => {
          fixture.componentRef.setInput("paged", true)
          turns = []
          fixture.componentInstance.pageTurn.subscribe((to) => turns.push(to))
        })

        it("doesn't glide the pages", async () => {
          await playAt(67)
          vi.advanceTimersByTime(2000)
          expect(page.scrollTop).toBe(0)
        })

        it("turns once the reading is past the verse's share of this page", async () => {
          split(100, 100)
          // Verse 2 reads from 64 to 70: half of it is here, so 67 is the turn.
          await playAt(66.4)
          vi.advanceTimersByTime(200)
          expect(turns).toEqual([])
          audio().currentTime = 67.2
          vi.advanceTimersByTime(200)
          expect(turns).toEqual(["next"])
        })

        it("turns to a verse that starts on a later page at once", async () => {
          const verse = split(0, 100)
          await playAt(64.5)
          vi.advanceTimersByTime(200)
          expect(turns).toEqual([verse])
        })

        it("counts the page as its container shows it, not the window", async () => {
          // A 400px-wide page container: a fragment at 450px is the next page.
          const container = document.createElement("div")
          container.className = "paged-view-container"
          container.style.cssText =
            "position:fixed;left:0;top:0;width:400px;height:10px"
          const verse = page.querySelector('[id="2"]') as HTMLElement
          verse.before(container)
          container.append(verse)
          vi.spyOn(verse, "getClientRects").mockReturnValue([
            new DOMRect(10, 0, 200, 100),
            new DOMRect(450, 0, 200, 100),
          ] as unknown as DOMRectList)
          try {
            await playAt(67.2)
            vi.advanceTimersByTime(200)
            expect(turns).toEqual(["next"])
          } finally {
            container.remove()
          }
        })

        it("turns back to a verse wholly on an earlier page", async () => {
          const verse = page.querySelector('[id="2"]') as HTMLElement
          vi.spyOn(verse, "getClientRects").mockReturnValue([
            new DOMRect(-600, 0, 200, 100),
          ] as unknown as DOMRectList)
          await playAt(65)
          vi.advanceTimersByTime(200)
          expect(turns).toEqual([verse])
        })

        it("doesn't turn while the verse is all on this page", async () => {
          split(200, 0)
          await playAt(69.9)
          vi.advanceTimersByTime(500)
          expect(turns).toEqual([])
        })
      })
    })

    it("takes the mark away when paused, and at the chapter's end", async () => {
      await listen([withVerses])
      tap(toggle())
      at(65)
      expect(read.at(-1)).toBe(2)
      tap(toggle())
      expect(read.at(-1)).toBeNull()

      tap(toggle())
      at(71)
      expect(read.at(-1)).toBe(3)
      // Past the chapter's end (280.8): the player stops there.
      at(281)
      expect(read.at(-1)).toBeNull()
    })

    it("says nothing for a chapter whose episode isn't in the player", async () => {
      await listen([withVerses])
      tap(toggle())
      at(65)
      render("exo", 6)
      await answer([{ ...withVerses, start: 280.8, end: 492.1 }], 6)
      expect(read.at(-1)).toBeNull()
    })
  })

  // The reader keeps --audio-card-height clear under the card (styles.css):
  // its rows must fit that height, or the text's last lines go under them.
  it("fits its rows inside --audio-card-height", async () => {
    await listen()
    const card = find(".audio-player") as HTMLElement
    const height = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--audio-card-height",
      ),
    )
    const box = card.getBoundingClientRect()
    expect(box.height).toBe(height)
    for (const part of card.querySelectorAll<HTMLElement>(
      "button, .audio-caption, .audio-time",
    )) {
      const inner = part.getBoundingClientRect()
      expect(inner.top).toBeGreaterThanOrEqual(box.top)
      expect(inner.bottom).toBeLessThanOrEqual(box.bottom)
    }
  })

  it("tucks into a pill that keeps playing, and comes back", async () => {
    await listen()
    tap(toggle())
    tap(byLabel("Esconder o leitor do +365"))
    expect(find(".audio-player")).toBeNull()
    expect(find(".audio-mini")).not.toBeNull()
    expect(audio().paused).toBe(false)
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")

    tap(toggle())
    expect(audio().paused).toBe(true)

    tap(byLabel("Mostrar o leitor do +365"))
    expect(find(".audio-player")).not.toBeNull()
    expect(find(".audio-mini")).toBeNull()
  })

  it("keeps focus on the toggle that replaces the one pressed", async () => {
    await listen()
    tap(byLabel("Esconder o leitor do +365"))
    await fixture.whenStable()
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Mostrar o leitor do +365",
    )
    tap(byLabel("Mostrar o leitor do +365"))
    await fixture.whenStable()
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Esconder o leitor do +365",
    )
  })

  describe("on a desktop", () => {
    let desktop: boolean
    beforeEach(() => {
      desktop = true
      localStorage.removeItem("audioCardPosition")
      localStorage.removeItem("audioCardWidth")
      vi.spyOn(window, "matchMedia").mockImplementation(
        (query: string) =>
          ({
            matches: query.includes("pointer: fine") ? desktop : false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      )
    })
    afterEach(() => {
      localStorage.removeItem("audioCardPosition")
      localStorage.removeItem("audioCardWidth")
    })
    const container = () => find(".auto-scroll-controls") as HTMLElement
    const drag = (from: Element, to: [number, number]) => {
      const box = from.getBoundingClientRect()
      const at = (x: number, y: number) => ({
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
      })
      from.dispatchEvent(
        new PointerEvent("pointerdown", at(box.left + 20, box.top + 5)),
      )
      window.dispatchEvent(new PointerEvent("pointermove", at(...to)))
      window.dispatchEvent(new PointerEvent("pointerup", at(...to)))
      fixture.detectChanges()
    }

    it("is dragged by its body, kept inside the window, and remembered", async () => {
      await listen()
      const caption = find(".audio-caption") as Element
      // The grab point (20px in, 5px down the caption) follows the pointer.
      const grabbed = caption.getBoundingClientRect()
      const corner = container().getBoundingClientRect()
      const left = Math.round(300 - (grabbed.left + 20 - corner.left))
      const top = Math.round(200 - (grabbed.top + 5 - corner.top))
      drag(caption, [300, 200])
      expect(container().style.left).toBe(`${left}px`)
      expect(container().style.top).toBe(`${top}px`)
      expect(
        JSON.parse(localStorage.getItem("audioCardPosition") ?? ""),
      ).toEqual({ left, top })

      drag(find(".audio-caption") as Element, [-500, -500])
      expect(container().style.left).toBe("8px")
      expect(container().style.top).toBe("8px")
    })

    it("stops following the pointer once the browser cancels it", async () => {
      await listen()
      const caption = find(".audio-caption") as Element
      const box = caption.getBoundingClientRect()
      const at = (x: number, y: number) => ({
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
        pointerId: 7,
      })
      caption.dispatchEvent(
        new PointerEvent("pointerdown", at(box.left + 20, box.top + 5)),
      )
      window.dispatchEvent(new PointerEvent("pointercancel", at(0, 0)))
      window.dispatchEvent(new PointerEvent("pointermove", at(300, 200)))
      fixture.detectChanges()
      expect(container().style.left).toBe("")
    })

    it("brings a place saved in a wider window back inside it", async () => {
      localStorage.setItem(
        "audioCardPosition",
        JSON.stringify({ left: 5000, top: 40 }),
      )
      fixture = TestBed.createComponent(AutoScrollControlsComponent)
      await listen()
      await fixture.whenStable()
      fixture.detectChanges()
      const right = container().getBoundingClientRect().right
      expect(right).toBeLessThanOrEqual(window.innerWidth - 8)
    })

    it("shows a grip to drag it by, on a desktop only", async () => {
      await listen()
      expect(find(".audio-grip")).not.toBeNull()
    })

    it("fits narrowed to 230px", async () => {
      localStorage.setItem("audioCardWidth", "230")
      fixture = TestBed.createComponent(AutoScrollControlsComponent)
      await listen()
      const card = (
        find(".audio-player") as HTMLElement
      ).getBoundingClientRect()
      expect(Math.round(card.width)).toBe(230)
      for (const part of fixture.nativeElement.querySelectorAll(
        ".audio-player button, .audio-time",
      )) {
        const box = (part as HTMLElement).getBoundingClientRect()
        expect(box.left).toBeGreaterThanOrEqual(card.left - 0.5)
        expect(box.right).toBeLessThanOrEqual(card.right + 0.5)
      }
    })

    // styles.css: the pages give up room under the card only while it's docked.
    it("takes room from the pages only while docked", async () => {
      const pages = document.createElement("div")
      pages.className = "paged-view-container"
      document.body.append(pages)
      try {
        await listen()
        const docked = pages.getBoundingClientRect().height
        drag(find(".audio-caption") as Element, [300, 200])
        const placed = pages.getBoundingClientRect().height
        // The shortened height is the rule's; a bare div has none without it.
        expect(docked).toBeGreaterThan(0)
        expect(placed).toBe(0)
      } finally {
        pages.remove()
      }
    })

    it("isn't dragged by its controls", async () => {
      await listen()
      drag(toggle() as Element, [300, 200])
      expect(container().style.left).toBe("")
    })

    it("docks again on a double-click on its caption", async () => {
      await listen()
      drag(find(".audio-caption") as Element, [300, 200])
      find(".audio-caption")?.dispatchEvent(new MouseEvent("dblclick"))
      fixture.detectChanges()
      expect(container().style.left).toBe("")
      expect(localStorage.getItem("audioCardPosition")).toBeNull()
    })

    it("comes back at the width the reader gave it", async () => {
      localStorage.setItem("audioCardWidth", "520")
      // Read when the control is made: make it again.
      fixture = TestBed.createComponent(AutoScrollControlsComponent)
      await listen()
      expect((find(".audio-player") as HTMLElement).style.width).toBe("520px")
    })

    it("stays put on a phone", async () => {
      desktop = false
      localStorage.setItem("audioCardPosition", '{"left":40,"top":40}')
      fixture = TestBed.createComponent(AutoScrollControlsComponent)
      await listen()
      expect(find(".audio-player")?.classList).not.toContain("movable")
      expect(find(".audio-grip")).toBeNull()
      expect(container().style.left).toBe("")
    })
  })

  describe("in the paged view", () => {
    beforeEach(() => fixture.componentRef.setInput("paged", true))

    it("is the +365 player, with no scrolling to swap to", async () => {
      render("exo", 5)
      await answer([day3])
      expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
      expect(modeToggle()).toBeNull()
      tap(toggle())
      expect(audio().src).toBe(`${day3.url}#t=56.5`)
    })

    it("doesn't flash the card while looking up after a chapter without one", async () => {
      render("exo", 7)
      await answer(null, 7)
      render("exo", 8)
      expect(find(".audio-player")).toBeNull()
      await answer(null, 8)
      expect(find(".audio-player")).toBeNull()
    })

    it("shows nothing where no episode reads the chapter", async () => {
      render("exo", 7)
      await answer(null, 7)
      expect(find(".auto-scroll-controls")).toBeNull()
    })

    it("stays «Ouvir» back in the scrolling view", async () => {
      render("exo", 5)
      await answer([day3])
      tap(toggle())
      fixture.componentRef.setInput("paged", false)
      fixture.detectChanges()
      expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
    })

    it("leaves the scrolling controls as they were after a look at the pages", async () => {
      render("exo", 5)
      await answer([day3])
      fixture.componentRef.setInput("paged", false)
      fixture.detectChanges()
      expect(toggle()?.getAttribute("aria-label")).toBe(
        "Ativar deslocamento automático",
      )
      expect(TestBed.inject(PodcastPlayerService).mode()).toBe("scroll")
    })
  })

  describe("position slider", () => {
    const slider = () =>
      find('input[aria-label="Posição no +365"]') as HTMLInputElement | null
    /** Plays the chapter and reports an episode 1103 s long. */
    const playing = async (episode: ChapterEpisode = day3) => {
      await listen([episode])
      tap(toggle())
      const stream = audio()
      Object.defineProperty(stream, "duration", { value: 1103 })
      stream.dispatchEvent(new Event("durationchange"))
      fixture.detectChanges()
      return stream
    }
    const at = (stream: HTMLAudioElement, seconds: number) => {
      stream.currentTime = seconds
      stream.dispatchEvent(new Event("timeupdate"))
      fixture.detectChanges()
    }

    it("waits for the chapter's episode", async () => {
      await listen()
      expect(slider()?.disabled).toBe(true)
    })

    it("spans the chapter's reading, from its start to its end", async () => {
      await playing()
      expect(slider()?.disabled).toBe(false)
      expect(slider()?.min).toBe("56.5")
      expect(slider()?.max).toBe("280.8")
    })

    it("follows the playback, said as time into the chapter", async () => {
      const stream = await playing()
      at(stream, 256.5)
      expect(slider()?.value).toBe("256.5")
      expect(slider()?.getAttribute("aria-valuetext")).toBe("3:20 de 3:44")
    })

    it("stays at the chapter's end while the episode plays on", async () => {
      const stream = await playing()
      at(stream, 600)
      expect(slider()?.value).toBe("280.8")
    })

    it("moves the episode to where it is dropped", async () => {
      const stream = await playing()
      const input = slider() as HTMLInputElement
      input.value = "200"
      input.dispatchEvent(new Event("input"))
      input.dispatchEvent(new Event("change"))
      fixture.detectChanges()
      expect(stream.currentTime).toBe(200)
    })

    it("says no negative time before an unknown end is known", async () => {
      await listen([{ ...day3, end: null }])
      tap(toggle())
      expect(slider()?.getAttribute("aria-valuetext")).toBe("0:00 de 0:00")
    })

    it("runs to the episode's end when the chapter's end is unknown", async () => {
      await playing({ ...day3, end: null })
      expect(slider()?.max).toBe("1103")
    })
  })
})
