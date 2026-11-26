import { provideHttpClient } from "@angular/common/http"
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { page } from "vitest/browser"
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

  // The fake streams (anchor.fm/s/x/…) are fetched for real and fail, on a
  // slow network after a test has moved on to them: the player would drop
  // the stream mid-test. Only the browser's own media errors are kept from
  // it; the ones the specs dispatch still reach it. Kept at the elements'
  // own listeners: they're never in the page, so their errors (which don't
  // bubble) never pass through the window.
  beforeEach(() => {
    const listen = EventTarget.prototype.addEventListener
    vi.spyOn(HTMLMediaElement.prototype, "addEventListener").mockImplementation(
      function (this: HTMLMediaElement, type, listener, options) {
        const real =
          type === "error" && listener
            ? (event: Event) => {
                if (event.isTrusted) return
                if (typeof listener === "function") listener.call(this, event)
                else listener.handleEvent(event)
              }
            : listener
        listen.call(this, type, real, options)
      },
    )
  })
  afterEach(() => http.verify())

  // Over the text, dark theme above all, they were too see-through at 85% on
  // a 60% pill; a touch see-through, alike, at 90% on the card's glass.
  it("draws its controls solid enough to read over the text, alike", async () => {
    render("exo", 5)
    await answer([day3])
    const controls = find(".auto-scroll-controls") as HTMLElement
    expect(getComputedStyle(controls).opacity).toBe("0.9")
    // ▶ no fainter than the pill beside it.
    expect(getComputedStyle(toggle() as HTMLElement).opacity).toBe("1")
    const pill = find(".auto-scroll-speed") as HTMLElement
    const alpha = getComputedStyle(pill).backgroundColor.match(/[\d.]+(?=\)$)/)
    // An rgba() of at least 0.9, or an opaque rgb().
    expect(alpha ? Number(alpha[0]) : 1).toBeGreaterThanOrEqual(0.85)
  })

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

  it("skips 15 s back and forward once the chapter is in the player", async () => {
    await listen()
    expect(byLabel("Recuar 15 segundos")?.disabled).toBe(true)

    tap(toggle())
    const stream = audio()
    Object.defineProperty(stream, "readyState", {
      value: HTMLMediaElement.HAVE_METADATA,
    })
    stream.currentTime = 100
    tap(byLabel("Avançar 15 segundos"))
    expect(stream.currentTime).toBe(115)
    tap(byLabel("Recuar 15 segundos"))
    tap(byLabel("Recuar 15 segundos"))
    expect(stream.currentTime).toBe(85)
  })

  it("cycles the speed from ½× to 2× with one button, in fractions", async () => {
    await listen()
    tap(toggle())
    const speed = () => byLabel("Velocidade do +365")
    const label = () => find(".rate")?.textContent?.trim()
    expect(speed()?.textContent?.trim()).toBe("1×")
    expect(label()).toBe("1 vez")

    tap(speed())
    expect(audio().playbackRate).toBe(1.1)
    expect(speed()?.textContent?.trim()).toBe("1⅒×")
    expect(label()).toBe("1,1 vezes")
    const seen = []
    for (let i = 0; i < 5; i++) {
      tap(speed())
      seen.push(speed()?.textContent?.trim())
    }
    expect(seen).toEqual(["1¼×", "1½×", "2×", "½×", "¾×"])
    expect(label()).toBe("0,75 vezes")
    tap(speed())
    expect(speed()?.textContent?.trim()).toBe("1×")
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
    expect(byLabel("Avançar 15 segundos")?.disabled).toBe(false)

    stream.src = "about:blank"
    tap(toggle())
    expect(stream.src).toBe("about:blank")
  })

  it("skips from the chapter's start while the stream still loads", async () => {
    await listen()
    tap(toggle())
    tap(byLabel("Avançar 15 segundos"))
    expect(audio().currentTime).toBe(71.5)
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
    // The headphones' or lock screen's skip, with no offset: the app's 15 s.
    handlers.get("seekforward")?.({ action: "seekforward" })
    expect(stream.currentTime).toBe(101.5)
  })

  // «Ouvir e ler» plays the episode's own intro first: no reading yet (the
  // plan's stage is null), and the card showed it stopped, ▶ skipping it.
  it("plays a day's intro on the card as the day's own", async () => {
    // ⏭ into the first reading follows it to its chapter.
    vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true)
    await listen()
    const player = TestBed.inject(PodcastPlayerService)
    player.throughEpisode.set(true)
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
      readings: [reading(5, 56.5), reading(6, 280.8)],
      reflection: 900,
    })
    player.toggle({ ...day3, start: 0 })
    const stream = audio()
    stream.currentTime = 10
    stream.dispatchEvent(new Event("timeupdate"))
    TestBed.tick()
    fixture.detectChanges()
    expect(TestBed.inject(Mais365Service).stage()).toBeNull()
    expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
    // The day's transport, not ⇅: ⏭ goes past the intro to its first reading.
    expect(find(".mode-toggle")).toBeNull()
    const next = find(".plan-skip")
    expect(next?.disabled).toBe(false)
    tap(next)
    expect(stream.currentTime).toBe(56.5)
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
    expect(byLabel("Recuar 15 segundos")?.disabled).toBe(false)
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

  it("tells Umami each start of playback and each new speed", async () => {
    const track = vi.mocked(TestBed.inject(AnalyticsService).track)
    await listen()
    tap(toggle())
    TestBed.tick()
    expect(track).toHaveBeenCalledWith(
      "podcast_play",
      expect.objectContaining({ day: 3, rate: 1 }),
    )
    TestBed.inject(PodcastPlayerService).cycleRate()
    expect(track).toHaveBeenCalledWith("podcast_speed", { rate: 1.1 })
  })

  // For the › arrow set on top of the card on a phone held sideways.
  it("publishes the card's height for what sits on top of it", async () => {
    await listen()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const card = (find(".audio-player") as HTMLElement).getBoundingClientRect()
    expect(
      document.documentElement.style.getPropertyValue(
        "--audio-card-live-height",
      ),
    ).toBe(`${Math.round(card.height)}px`)
    fixture.destroy()
    expect(
      document.documentElement.style.getPropertyValue(
        "--audio-card-live-height",
      ),
    ).toBe("")
  })

  // The lock screen: a chapter is the Bible's, only a day of the plan +365's.
  it("names a chapter's audio the Bible's, and a plan day's +365's", async () => {
    await listen()
    tap(toggle())
    TestBed.tick()
    expect(navigator.mediaSession.metadata?.artist).toBe("Bíblia Sagrada")
    const player = TestBed.inject(PodcastPlayerService)
    player.throughEpisode.set(true)
    player.position.set(100)
    TestBed.tick()
    expect(navigator.mediaSession.metadata?.artist).toBe("+365 · Dia 3")
    // An introduction, a fractional day in the data: not «Dia 6.5».
    const current = player.current()
    if (current) player.adopt({ ...current, day: 6.5 })
    TestBed.tick()
    expect(navigator.mediaSession.metadata?.artist).toBe("+365")
    // The day let go while paused, nothing else moving: the Bible's again.
    player.throughEpisode.set(false)
    TestBed.tick()
    expect(navigator.mediaSession.metadata?.artist).toBe("Bíblia Sagrada")
  })

  // A pause that moved nothing else (before the stream loaded) left the
  // system's player at ⏸; one ended or failed, at its last state.
  it("tells the system's player each pause, and when nothing is left", async () => {
    await listen()
    tap(toggle())
    TestBed.tick()
    expect(navigator.mediaSession.playbackState).toBe("playing")
    tap(toggle())
    TestBed.tick()
    expect(navigator.mediaSession.playbackState).toBe("paused")
    tap(toggle())
    TestBed.tick()
    audio().dispatchEvent(new Event("ended"))
    TestBed.tick()
    expect(navigator.mediaSession.playbackState).toBe("none")
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
    tap(byLabel("Recuar 15 segundos"))
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

  // Salmo 119 is read over Dia 43–45, a third a day.
  describe("a chapter read in parts", () => {
    const part = (
      day: number,
      range: [number, number],
      start: number,
    ): ChapterEpisode => ({
      day,
      title: `Dia ${day}`,
      url: `https://anchor.fm/s/x/podcast/play/${day}.m4a`,
      start,
      end: start + 300,
      range,
    })
    const first = part(43, [1, 56], 1000)
    const second = part(44, [57, 120], 1100)
    const third = part(45, [121, 176], 1200)
    // Each day announces its part before reading it: "Salmo 119, 57 a 120".
    second.verses = [[57, 1108.8]]
    const player = () => TestBed.inject(PodcastPlayerService)

    // A +365 day plays a part with the API's own start, which parts() moves
    // (to its first verse): it wasn't known as the chapter's, and ▶ started
    // the chapter over instead of going on.
    it("resumes a part a +365 day left in the player, where it was", async () => {
      await listen([second, third, first])
      const p = player()
      p.toggle(second)
      const stream = audio()
      stream.currentTime = 1150
      stream.dispatchEvent(new Event("timeupdate"))
      p.pause()
      TestBed.tick()
      fixture.detectChanges()
      tap(toggle())
      // The same element plays on, the third part made ready on the other.
      expect(stream.paused).toBe(false)
      expect(stream.currentTime).toBe(1150)
      // Its place in the whole chapter, and on to the third part at its end.
      fixture.detectChanges()
      expect(times()).toEqual(["5:50", "−9:10"])
      endPart(stream, 1401)
      expect(player().current()?.range).toEqual([121, 176])
    })
    const times = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll(
          ".audio-time",
        ) as NodeListOf<HTMLElement>,
      ).map((time) => time.textContent?.trim())
    const sources = () =>
      play.mock.contexts.map(
        (element: unknown) => (element as HTMLAudioElement).src,
      )
    const endPart = (stream: HTMLAudioElement, end: number) => {
      stream.currentTime = end
      stream.dispatchEvent(new Event("timeupdate"))
      fixture.detectChanges()
    }

    it("plays them in order as one, the next already loaded, without a pause between", async () => {
      // Listed by day, not necessarily in the chapter's order.
      await listen([second, third, first])
      tap(toggle())
      await fixture.whenStable()
      const stream = audio()
      // The first part plays; the second loaded on the other element, played
      // muted within the tap so Safari lets it play later, and set back.
      // The second past its day's announcement, just before its first verse.
      expect(sources()).toEqual([`${first.url}#t=1000`, `${second.url}#t=1108`])
      const playing = play.mock.contexts[0] as HTMLAudioElement
      expect(playing.paused).toBe(false)
      expect(stream.paused).toBe(true)
      expect(stream.muted).toBe(false)
      expect(stream.currentTime).toBe(1108)
      expect(player().current()?.title).toBe("Êxodo 5")

      // Its end is where the next segment began, maybe within the last word:
      // it plays 0.05 s on before the next part takes over.
      TestBed.tick()
      const told = navigator.mediaSession.metadata
      vi.useFakeTimers()
      endPart(playing, 1300.02)
      expect(stream.paused).toBe(true)
      playing.currentTime = 1300.5
      await vi.advanceTimersByTimeAsync(300)
      fixture.detectChanges()
      TestBed.tick()
      // The system's player told of the part again, on the new element.
      expect(navigator.mediaSession.metadata).not.toBe(told)
      expect(navigator.mediaSession.playbackState).toBe("playing")
      // On at once: the loaded element plays, the ended one stops.
      expect(stream.paused).toBe(false)
      expect(playing.paused).toBe(true)
      expect(player().current()?.range).toEqual([57, 120])
      expect(player().position()).toBe(1108)
      expect(toggle()?.getAttribute("aria-label")).toBe("Pausar o +365")
      // The third now loads where the first played.
      expect(playing.src).toBe(`${third.url}#t=1200`)

      endPart(stream, 1401)
      expect(playing.paused).toBe(false)
      expect(player().current()?.range).toEqual([121, 176])

      // The chapter's last part ends: it stops there.
      endPart(playing, 1500)
      expect(playing.paused).toBe(true)
      expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
    })

    // The parts last 300, 292 (from its first verse) and 300 s: 14:52 in all.
    it("shows the parts as one recording: its whole length, and the place in it", async () => {
      await listen([first, second, third])
      tap(toggle())
      await fixture.whenStable()
      fixture.detectChanges()
      expect(times()).toEqual(["0:00", "−14:52"])

      endPart(play.mock.contexts[0] as HTMLAudioElement, 1301)
      audio().currentTime = 1168
      audio().dispatchEvent(new Event("timeupdate"))
      fixture.detectChanges()
      // 5:00 of the first part, and 1:00 into the second.
      expect(times()).toEqual(["6:00", "−8:52"])
    })

    it("seeks into whichever part holds a time of the whole chapter", async () => {
      await listen([first, second, third])
      tap(toggle())
      await fixture.whenStable()
      const stream = play.mock.contexts[0] as HTMLAudioElement
      // 10:00 in: 8 s into the third part.
      player().seekChapter(600)
      expect(player().current()?.range).toEqual([121, 176])
      expect(stream.src).toBe(`${third.url}#t=1208`)
      expect(player().position()).toBe(1208)
      expect(player().playing()).toBe(true)
      // Not pulled back to the part's start while it loads; there once loaded.
      stream.dispatchEvent(new Event("timeupdate"))
      expect(stream.currentTime).toBe(0)
      stream.dispatchEvent(new Event("loadedmetadata"))
      expect(stream.currentTime).toBe(1208)
      fixture.detectChanges()
      expect(times()).toEqual(["10:00", "−4:52"])
      // And back into the first.
      player().seekChapter(30)
      expect(player().current()?.range).toEqual([1, 56])
      expect(stream.src).toBe(`${first.url}#t=1030`)
    })

    // Paused, a part jumped to waits to load: what's done meanwhile counts.
    it("keeps a seek or a skip made while a part jumped to still loads", async () => {
      await listen([first, second, third])
      tap(toggle())
      player().pause()
      const stream = play.mock.contexts.find((element: unknown) =>
        (element as HTMLAudioElement).src.startsWith(first.url),
      ) as HTMLAudioElement
      // 6:40 in, then 7:30: both in the second part (from 1108).
      player().seekChapter(400)
      expect(stream.src).toBe(`${second.url}#t=1208`)
      player().seekChapter(450)
      player().skip(15)
      stream.dispatchEvent(new Event("loadedmetadata"))
      expect(stream.currentTime).toBe(1273)
      expect(player().position()).toBe(1273)
    })

    it("skips 15 s on into the next part, or back into the one before", async () => {
      await listen([first, second, third])
      tap(toggle())
      await fixture.whenStable()
      const stream = play.mock.contexts[0] as HTMLAudioElement
      stream.currentTime = 1295
      tap(byLabel("Avançar 15 segundos"))
      expect(player().current()?.range).toEqual([57, 120])
      expect(stream.src).toBe(`${second.url}#t=1118`)
      stream.dispatchEvent(new Event("loadedmetadata"))
      tap(byLabel("Recuar 15 segundos"))
      expect(player().current()?.range).toEqual([1, 56])
      expect(stream.src).toBe(`${first.url}#t=1295`)
    })

    it("plays the chapter again from its first part once it's over", async () => {
      await listen([first, second])
      tap(toggle())
      await fixture.whenStable()
      const playing = play.mock.contexts[0] as HTMLAudioElement
      endPart(playing, 1301)
      endPart(audio(), 1400)
      expect(toggle()?.getAttribute("aria-label")).toBe("Ouvir o +365")
      tap(toggle())
      expect(player().current()?.range).toEqual([1, 56])
      expect(player().position()).toBe(1000)
      expect(player().playing()).toBe(true)
    })

    // A +365 day plays its reading alone; «Terminar» leaves it in the player.
    it("goes on through the parts after a day left its first in the player", async () => {
      await listen([first, second, third])
      // No await between: the fake streams' load errors would end it.
      player().toggle(first)
      player().pause()
      // The player's own, by its stream: not whichever played first.
      const playing = play.mock.contexts.find((element: unknown) =>
        (element as HTMLAudioElement).src.startsWith(first.url),
      ) as HTMLAudioElement
      tap(toggle())
      // Resumed from the card: the second part made ready within the tap.
      expect(audio().src).toBe(`${second.url}#t=1108`)
      endPart(playing, 1301)
      expect(player().current()?.range).toEqual([57, 120])

      // And the slider's time is the whole chapter's, once handed the parts.
      player().toggle(first)
      player().pause()
      player().seekChapter(600, [first, second, third])
      expect(player().current()?.range).toEqual([121, 176])
    })

    // "Provérbios 3, 1 a 4": the chapter's name, then verse 1.
    it("says the chapter's name, then skips the first part's verses named", async () => {
      await listen([
        { ...first, titleStart: 1000.6, titleEnd: 1002, verses: [[1, 1004.8]] },
        second,
      ])
      tap(toggle())
      const stream = play.mock.contexts.find((element: unknown) =>
        (element as HTMLAudioElement).src.startsWith(first.url),
      ) as HTMLAudioElement
      // From the chapter's name, not the part's start before it.
      expect(stream.src).toBe(`${first.url}#t=1000.6`)
      stream.currentTime = 1001.9
      stream.dispatchEvent(new Event("timeupdate"))
      expect(stream.currentTime).toBe(1004)
      // Not again, played on.
      stream.currentTime = 1010
      stream.dispatchEvent(new Event("timeupdate"))
      expect(stream.currentTime).toBe(1010)
    })

    // Without the API's titleEnd: as before, at the first verse.
    it("starts the first part at its first verse too, past the day's announcement", async () => {
      await listen([{ ...first, verses: [[1, 1004.8]] }, second])
      tap(toggle())
      expect(
        play.mock.contexts.some(
          (element: unknown) =>
            (element as HTMLAudioElement).src === `${first.url}#t=1004`,
        ),
      ).toBe(true)
    })

    // The lock screen's play and pause, on the part playing, not the standby.
    it("answers the system's play and pause on the part playing", async () => {
      const handlers = new Map<string, MediaSessionActionHandler | null>()
      vi.spyOn(navigator.mediaSession, "setActionHandler").mockImplementation(
        (action, handler) => {
          handlers.set(action, handler)
        },
      )
      await listen([first, second])
      tap(toggle())
      const playing = play.mock.contexts[0] as HTMLAudioElement
      handlers.get("pause")?.({ action: "pause" })
      expect(playing.paused).toBe(true)
      expect(player().playing()).toBe(false)
      handlers.get("play")?.({ action: "play" })
      expect(playing.paused).toBe(false)
      expect(player().playing()).toBe(true)
    })

    // Salmo 119's first part is also Dia 43's first reading.
    it("leaves the parts aside while a day plays its episode through", async () => {
      await listen([first, second, third])
      tap(toggle())
      player().pause()
      player().throughEpisode.set(true)
      player().toggle(first)
      const stream = play.mock.contexts.find((element: unknown) =>
        (element as HTMLAudioElement).src.startsWith(first.url),
      ) as HTMLAudioElement
      stream.currentTime = 1295
      player().skip(15)
      expect(player().current()?.range).toEqual([1, 56])
      expect(stream.src).toBe(`${first.url}#t=1000`)
      expect(stream.currentTime).toBe(1310)
    })

    it("lets the next part's loading say nothing of what plays", async () => {
      await listen([first, second])
      tap(toggle())
      await fixture.whenStable()
      const loading = audio()
      loading.dispatchEvent(new Event("pause"))
      loading.dispatchEvent(new Event("error"))
      fixture.detectChanges()
      expect(player().playing()).toBe(true)
      expect(player().current()?.range).toEqual([1, 56])
    })

    it("keeps the standby part silent, whatever the browser does with it", async () => {
      await listen([first, second, third])
      tap(toggle())
      await fixture.whenStable()
      const standby = audio()
      standby.muted = false
      // As iOS did: the loaded element starting by itself.
      standby.play()
      standby.dispatchEvent(new Event("playing"))
      expect(standby.paused).toBe(true)
      expect(player().current()?.range).toEqual([1, 56])
    })

    it("starts a part sought into at a time Safari takes, to the hundredth", async () => {
      await listen([first, second, third])
      tap(toggle())
      await fixture.whenStable()
      const stream = play.mock.contexts[0] as HTMLAudioElement
      player().seekChapter(600.123456)
      expect(stream.src).toBe(`${third.url}#t=1208.12`)
    })

    it("stops loading the next part when something else plays", async () => {
      await listen([first, second])
      tap(toggle())
      await fixture.whenStable()
      const standby = audio()
      player().toggle(day3)
      expect(standby.getAttribute("src")).toBeNull()
    })
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
    tap(byLabel("Avançar 15 segundos"))
    expect(stream.currentTime).toBe(280.8)

    stream.currentTime = 60
    tap(byLabel("Recuar 15 segundos"))
    expect(stream.currentTime).toBe(56.5)
  })

  // Setting a new src resets the element to 0:00 and says so before #t= applies.
  it("keeps the chapter's start while a new source still loads", async () => {
    await listen()
    tap(toggle())
    const player = TestBed.inject(PodcastPlayerService)
    expect(player.position()).toBe(56.5)
    const stream = audio()
    stream.currentTime = 0
    stream.dispatchEvent(new Event("timeupdate"))
    expect(player.position()).toBe(56.5)
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
    tap(byLabel("Avançar 15 segundos"))
    tap(byLabel("Avançar 15 segundos"))
    expect(audio().currentTime).toBe(86.5)
  })

  it("times the chapter's end again when the speed changes near it", async () => {
    await listen()
    tap(toggle())
    const stream = audio()
    vi.useFakeTimers()
    stream.currentTime = 280.6
    stream.dispatchEvent(new Event("timeupdate"))
    tap(byLabel("Velocidade do +365"))
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

      // At 2× the reading runs twice as fast: so does the glide, or it lags.
      it("glides at the reading's pace: twice as fast at 2×", async () => {
        TestBed.inject(PodcastPlayerService).cycleRate()
        TestBed.inject(PodcastPlayerService).cycleRate()
        TestBed.inject(PodcastPlayerService).cycleRate()
        TestBed.inject(PodcastPlayerService).cycleRate()
        expect(TestBed.inject(PodcastPlayerService).rate()).toBe(2)
        await playAt(67)
        // Half the time it takes at 1× (settled within 7 s, there).
        vi.advanceTimersByTime(3500)
        expect(Math.abs(page.scrollTop - 162.5)).toBeLessThanOrEqual(1.5)
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
  // styles.css: a phone held sideways has no height to spare under the text.
  // A big phone (wide enough, in this browser, for a desktop's movable card)
  // and the lowest: 375px, of which the header takes 56px.
  for (const [width, height, inPlan] of [
    [932, 430, false],
    [932, 430, true],
    [667, 375, false],
    [667, 375, true],
  ] as const) {
    it(`sits in the right corner on a low landscape screen (${width}x${height}${inPlan ? ", a day of the plan" : ""}), the text left of it`, async () => {
      const scroller = document.createElement("bible-reader")
      const content = document.createElement("div")
      content.className = "mat-drawer-content"
      scroller.append(content)
      document.body.append(scroller)
      await page.viewport(width, height)
      try {
        await listen()
        if (inPlan) {
          vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true)
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
          audio().currentTime = 950
          audio().dispatchEvent(new Event("timeupdate"))
          TestBed.tick()
          fixture.detectChanges()
          expect(find(".plan-back")).not.toBeNull()
        }
        const box = (selector: string) =>
          (find(selector) as HTMLElement).getBoundingClientRect()
        const card = box(".audio-player")
        // A desktop's wider minimum (a plan day's 264px) gives way too.
        if (width > 768) expect(find(".audio-player.movable")).not.toBeNull()
        // Narrow, in the bottom right corner, under the header.
        expect(Math.round(card.width)).toBe(176)
        expect(card.right).toBeGreaterThan(width - 17)
        expect(card.right).toBeLessThanOrEqual(width)
        expect(card.bottom).toBeGreaterThan(height - 17)
        expect(card.bottom).toBeLessThanOrEqual(height)
        expect(card.top).toBeGreaterThan(56)
        // The text keeps clear of it: the card's width and a margin.
        expect(getComputedStyle(content).paddingRight).toBe("192px")
        // Nothing spills out of the card, and every button can be tapped.
        for (const part of fixture.nativeElement.querySelectorAll(
          ".audio-player :is(button, mat-slider, .audio-time, .audio-caption)",
        ) as NodeListOf<HTMLElement>) {
          const inner = part.getBoundingClientRect()
          expect(inner.left).toBeGreaterThanOrEqual(card.left)
          expect(inner.right).toBeLessThanOrEqual(card.right)
          expect(inner.top).toBeGreaterThanOrEqual(card.top)
          expect(inner.bottom).toBeLessThanOrEqual(card.bottom)
          if (part.tagName === "BUTTON") {
            expect(inner.width).toBeGreaterThanOrEqual(40)
            expect(inner.height).toBeGreaterThanOrEqual(40)
          }
        }
        // The timeline over ▶, the biggest, between ±15 s; the rest below.
        const play = box(".audio-toggle")
        expect(play.top).toBeGreaterThan(box(".audio-position").top)
        expect(play.width).toBeGreaterThan(box(".skip-back").width)
        expect(box(".skip-back").right).toBeLessThanOrEqual(play.left)
        expect(box(".skip-forward").left).toBeGreaterThanOrEqual(play.right)
        expect(box(".audio-speed").top).toBeGreaterThanOrEqual(play.bottom)
      } finally {
        await page.viewport(800, 600)
        scroller.remove()
      }
    })
  }

  // styles.css: with room beside the card, the ‹ › arrows sat level with its
  // row of buttons, low against it; they're centred on it.
  it("centres the chapter arrows on the card beside them", async () => {
    const arrow = document.createElement("button")
    arrow.className = "floating-nav-button next-chapter"
    arrow.style.cssText = "position: fixed; right: 16px; height: 48px"
    document.body.append(arrow)
    await page.viewport(615, 900)
    try {
      await listen()
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const card = (
        find(".audio-player") as HTMLElement
      ).getBoundingClientRect()
      const box = arrow.getBoundingClientRect()
      expect(box.left).toBeGreaterThanOrEqual(card.right)
      expect((box.top + box.bottom) / 2).toBeCloseTo(
        (card.top + card.bottom) / 2,
        0,
      )
    } finally {
      await page.viewport(800, 600)
      arrow.remove()
    }
  })

  // The speed was a 64px pill beside 40px circles, and the chevron's 24px
  // icon poked out of its 24px button's hover circle.
  it("sizes the speed as its neighbours, and the chevron inside its button", async () => {
    await listen()
    const box = (selector: string) =>
      (find(selector) as HTMLElement).getBoundingClientRect()
    const speed = box(".audio-speed")
    expect([speed.width, speed.height]).toEqual([40, 40])
    expect(getComputedStyle(find(".audio-speed") as Element).borderRadius).toBe(
      "50%",
    )
    const button = box(".audio-collapse")
    const icon = box(".audio-collapse .mat-icon")
    expect(icon.left).toBeGreaterThanOrEqual(button.left)
    expect(icon.right).toBeLessThanOrEqual(button.right)
    expect(icon.top).toBeGreaterThanOrEqual(button.top)
    expect(icon.bottom).toBeLessThanOrEqual(button.bottom)
  })

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

    it("shows a grip to drag it by, on a desktop only, lying down", async () => {
      await listen()
      const grip = find(".audio-grip") as HTMLElement
      expect(grip).not.toBeNull()
      // Two rows of dots: the upright icon turned on its side.
      expect(getComputedStyle(grip).rotate).toBe("90deg")
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

    // styles.css: scrolling, room after the last line to bring it above the
    // card; not a shorter scroller, which iOS Safari clips the card to.
    it("leaves room under the scrolling text for the docked card", async () => {
      const reader = document.createElement("div")
      reader.style.height = "500px"
      const scroller = document.createElement("div")
      scroller.className = "mat-drawer-content"
      reader.append(scroller)
      // Full height from a stylesheet, as Material's: an inline one would win.
      const material = document.createElement("style")
      material.textContent = ".mat-drawer-content { height: 100% }"
      document.head.append(material)
      document.body.append(reader)
      try {
        await listen()
        expect(scroller.getBoundingClientRect().height).toBe(500)
        // The card's 106px and its 32px of gap.
        expect(getComputedStyle(scroller).paddingBottom).toBe("138px")
        drag(find(".audio-caption") as Element, [300, 200])
        expect(getComputedStyle(scroller).paddingBottom).toBe("0px")
      } finally {
        reader.remove()
        material.remove()
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
