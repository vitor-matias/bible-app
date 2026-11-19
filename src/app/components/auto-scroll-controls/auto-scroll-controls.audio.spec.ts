import { provideHttpClient } from "@angular/common/http"
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { apiBaseUrl } from "../../config"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import type { ChapterEpisode } from "../../services/podcast-player.service"
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

  it("plays the hardcoded Dia 1–5 chapters without asking the API", async () => {
    render("gen", 1)
    await fixture.whenStable()
    fixture.detectChanges()
    tap(modeToggle())
    tap(toggle())
    expect(audio().src).toMatch(/^https:\/\/anchor\.fm\/.+#t=58\.4$/)
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

      it("drifts the text so the reading sits mid-screen, a little each frame", async () => {
        // Half through verse 2 (64 to 70 s): 300px into the text, to sit at 150.
        await playAt(67)
        vi.advanceTimersByTime(100)
        const early = page.scrollTop
        expect(early).toBeGreaterThan(0)
        expect(early).toBeLessThan(40)
        vi.advanceTimersByTime(4000)
        expect(page.scrollTop).toBeGreaterThan(130)
        expect(page.scrollTop).toBeLessThanOrEqual(151)
      })

      it("leaves the text alone for a while after the reader moves it", async () => {
        await playAt(67)
        page.dispatchEvent(new WheelEvent("wheel"))
        vi.advanceTimersByTime(4000)
        expect(page.scrollTop).toBe(0)
        vi.advanceTimersByTime(4000)
        expect(page.scrollTop).toBeGreaterThan(0)
      })

      it("doesn't glide the pages", async () => {
        fixture.componentRef.setInput("paged", true)
        await playAt(67)
        vi.advanceTimersByTime(2000)
        expect(page.scrollTop).toBe(0)
      })
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
