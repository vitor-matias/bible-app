import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { Mais365Service } from "../../services/mais365.service"
import type { ChapterEpisode } from "../../services/podcast-player.service"
import { PodcastPlayerService } from "../../services/podcast-player.service"
import { NowPlayingComponent } from "./now-playing.component"

describe("NowPlayingComponent", () => {
  let fixture: ComponentFixture<NowPlayingComponent>
  const episode: ChapterEpisode = {
    day: 3,
    title: "Génesis 5",
    url: "u",
    start: 0,
    end: 10,
  }
  const player = {
    current: signal<ChapterEpisode | null>(null),
    playing: signal(false),
    toggle: vi.fn(),
  }
  const plan = { active: signal<{ day: number } | null>(null), toggle: vi.fn() }
  const host = () => fixture.nativeElement as HTMLElement

  beforeEach(() => {
    player.current.set(null)
    player.playing.set(false)
    plan.active.set(null)
    player.toggle.mockClear()
    plan.toggle.mockClear()
    TestBed.configureTestingModule({
      providers: [
        { provide: PodcastPlayerService, useValue: player },
        { provide: Mais365Service, useValue: plan },
      ],
    })
    fixture = TestBed.createComponent(NowPlayingComponent)
    fixture.detectChanges()
  })

  it("shows nothing with nothing playing, nor for audio left after ✕", () => {
    expect(host().querySelector(".now-playing")).toBeNull()
    player.current.set(episode)
    fixture.detectChanges()
    expect(host().querySelector(".now-playing")).toBeNull()
  })

  it("names a day's reading, and pauses the day", () => {
    player.current.set(episode)
    player.playing.set(true)
    plan.active.set({ day: 3 })
    fixture.detectChanges()
    expect(host().textContent).toContain("Génesis 5")
    expect(host().textContent).toContain("+365 · Dia 3")
    host().querySelector<HTMLButtonElement>("button")?.click()
    expect(plan.toggle).toHaveBeenCalled()
  })

  it("pauses a chapter's audio heard outside the plan", () => {
    player.current.set(episode)
    player.playing.set(true)
    fixture.detectChanges()
    host()
      .querySelector<HTMLButtonElement>('button[aria-label="Pausar o +365"]')
      ?.click()
    expect(player.toggle).toHaveBeenCalledWith(episode)
  })
})
