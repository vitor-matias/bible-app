import { provideHttpClient } from "@angular/common/http"
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { apiBaseUrl } from "../../config"
import type { ChapterEpisode } from "../../services/podcast-player.service"
import { ChapterAudioComponent } from "./chapter-audio.component"

const day3: ChapterEpisode = {
  day: 3,
  title: "Dia 3 - A Arca de Noé",
  url: "https://anchor.fm/s/x/podcast/play/3.m4a",
  start: 56.5,
}
const genesis6 = { ...day3, start: 280.8 }

describe("ChapterAudioComponent", () => {
  let fixture: ComponentFixture<ChapterAudioComponent>
  let http: HttpTestingController
  let play: ReturnType<typeof vi.spyOn>

  // The episodes request holds the fixture unstable until answer() flushes it.
  const render = async (bookId: string, chapter: number) => {
    fixture.componentRef.setInput("bookId", bookId)
    fixture.componentRef.setInput("chapter", chapter)
    fixture.detectChanges()
  }
  const answer = async (episodes: ChapterEpisode[] | null, chapter = 5) => {
    const request = http.expectOne(`${apiBaseUrl}/audio/gen/${chapter}`)
    if (episodes) request.flush({ episodes })
    else
      request.flush(
        { error: "Audio not found" },
        { status: 404, statusText: "Not Found" },
      )
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const button = () =>
    fixture.nativeElement.querySelector("button") as HTMLButtonElement | null
  const audio = () => play.mock.contexts.at(-1) as HTMLAudioElement

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    http = TestBed.inject(HttpTestingController)
    // No real stream: playing just reports it started.
    play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play"))
        return Promise.resolve()
      })
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      this.dispatchEvent(new Event("pause"))
    })
    fixture = TestBed.createComponent(ChapterAudioComponent)
  })

  afterEach(() => http.verify())

  it("shows nothing for a chapter no episode reads", async () => {
    await render("gen", 5)
    await answer(null)
    expect(button()).toBeNull()
  })

  it("plays the episode from where the chapter starts in one touch", async () => {
    await render("gen", 5)
    await answer([day3, { ...day3, day: 40 }])
    expect(button()?.textContent).toContain("Ouvir no +365")

    button()?.click()
    fixture.detectChanges()

    expect(play).toHaveBeenCalledTimes(1)
    expect(audio().src).toBe(`${day3.url}#t=56.5`)
    expect(button()?.textContent).toContain("Pausar")
  })

  it("pauses and resumes on the next touches", async () => {
    await render("gen", 5)
    await answer([day3])
    button()?.click()
    button()?.click()
    fixture.detectChanges()
    expect(button()?.textContent).toContain("Ouvir no +365")

    button()?.click()
    fixture.detectChanges()
    expect(play).toHaveBeenCalledTimes(2)
    expect(button()?.textContent).toContain("Pausar")
  })

  it("plays from the top when the episode has no start", async () => {
    await render("gen", 5)
    await answer([{ ...day3, start: null }])
    button()?.click()
    expect(audio().src).toBe(day3.url)
  })

  it("stays hidden when the request fails", async () => {
    await render("gen", 5)
    http
      .expectOne(`${apiBaseUrl}/audio/gen/5`)
      .flush("boom", { status: 500, statusText: "Server Error" })
    await fixture.whenStable()
    fixture.detectChanges()
    expect(button()).toBeNull()
  })

  it("seeks within the episode for the next chapter it reads", async () => {
    await render("gen", 5)
    await answer([day3])
    button()?.click()
    const stream = audio()

    await render("gen", 6)
    await answer([genesis6], 6)
    expect(button()?.textContent).toContain("Ouvir no +365")
    button()?.click()

    expect(audio()).toBe(stream)
    expect(stream.src).toBe(`${day3.url}#t=56.5`)
    expect(stream.currentTime).toBe(280.8)
  })
})
