import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { lastCall } from "../testing/spy-obj"
import { Mais365Service } from "./mais365.service"
import {
  type ChapterEpisode,
  PodcastPlayerService,
} from "./podcast-player.service"

describe("Mais365Service", () => {
  let player: {
    current: ReturnType<typeof signal<ChapterEpisode | null>>
    position: ReturnType<typeof signal<number>>
    playing: ReturnType<typeof signal<boolean>>
    throughEpisode: ReturnType<typeof signal<boolean>>
    mode: ReturnType<typeof signal<string>>
    collapsed: ReturnType<typeof signal<boolean>>
    toggle: ReturnType<typeof vi.fn>
    adopt: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    isCurrent: ReturnType<typeof vi.fn>
    seek?: ReturnType<typeof vi.fn>
  }
  let navigate: ReturnType<typeof vi.fn>

  const create = () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PodcastPlayerService, useValue: player },
        { provide: Router, useValue: { navigate } },
      ],
    })
    return TestBed.inject(Mais365Service)
  }
  const at = (seconds: number) => {
    player.position.set(seconds)
    TestBed.tick()
  }

  beforeEach(() => {
    localStorage.removeItem("mais365Done")
    navigate = vi.fn().mockResolvedValue(true)
    player = {
      current: signal<ChapterEpisode | null>(null),
      position: signal(0),
      playing: signal(false),
      throughEpisode: signal(false),
      mode: signal("scroll"),
      collapsed: signal(true),
      // Loads what it's given, as the real player does.
      toggle: vi.fn((episode: ChapterEpisode) => {
        player.current.set(episode)
        player.playing.set(true)
      }),
      adopt: vi.fn((episode: ChapterEpisode) => player.current.set(episode)),
      pause: vi.fn(() => player.playing.set(false)),
      isCurrent: vi.fn(() => false),
    }
  })

  afterEach(() => localStorage.removeItem("mais365Done"))

  it("starts with Dia 0, the introduction, and puts each introduction after its day", () => {
    const plan = create()
    expect(plan.today().day).toBe(0)
    expect(plan.today().title).toBe("Introdução à Criação do Mundo")
    const days = plan.days.map(({ day }) => day)
    expect(days.slice(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6.5])
  })

  it("makes today the first day not done, and remembers what is done", () => {
    create().markDone(0, true)
    TestBed.resetTestingModule()
    const plan = create()
    expect(plan.today().day).toBe(1)
    plan.markDone(0, false)
    expect(plan.today().day).toBe(0)
  })

  it("starts afresh when what is stored is not a list of days", () => {
    localStorage.setItem("mais365Done", "{}")
    expect(create().today().day).toBe(0)
    TestBed.resetTestingModule()
    localStorage.setItem("mais365Done", '[1, "x", null, 0]')
    expect(create().done()).toEqual([1, 0])
  })

  it("starts a day from its first reading even when that reading is paused further on", () => {
    player.seek = vi.fn()
    const plan = create()
    const day = plan.days.find(({ day }) => day === 1) as (typeof plan.days)[0]
    player.isCurrent.mockReturnValue(true)
    plan.start(day)
    expect(player.seek).toHaveBeenCalledWith(day.readings[0].episode.start)
  })

  it("lets the day go, unmarked and still playing, when another stream is played", () => {
    const plan = create()
    const day = plan.days.find(({ day }) => day === 3) as (typeof plan.days)[0]
    plan.start(day)
    TestBed.tick()
    // A chapter of Dia 4, played by hand.
    player.current.set({
      day: 4,
      title: "Dia 4",
      url: "dia4",
      start: 0,
      end: 1404,
    })
    TestBed.tick()
    expect(plan.active()).toBeNull()
    expect(player.throughEpisode()).toBe(false)
    expect(player.pause).not.toHaveBeenCalled()
    at(1404)
    player.current.set(null)
    TestBed.tick()
    expect(plan.done()).toEqual([])
  })

  it("turns to each reading as the podcast reaches it", () => {
    const plan = create()
    const day = plan.days.find(({ day }) => day === 1) as (typeof plan.days)[0]
    plan.start(day)
    TestBed.tick()
    expect(player.throughEpisode()).toBe(true)
    expect(lastCall(navigate)).toEqual([["/", "gen", 1]])

    at(day.readings[1].episode.start as number)
    expect(lastCall(navigate)).toEqual([["/", "gen", 2]])
    expect(player.current()).toEqual({
      ...day.readings[1].episode,
      title: "Génesis 2",
    })

    at(day.readings[2].episode.start as number)
    expect(lastCall(navigate)).toEqual([["/", "psa", 19]])
    expect(plan.done()).toEqual([])
  })

  it("skips to the next reading, and from the last to the reflection", () => {
    player.seek = vi.fn((seconds: number) => at(seconds))
    const plan = create()
    const day = plan.days.find(({ day }) => day === 1) as (typeof plan.days)[0]
    plan.start(day)
    TestBed.tick()
    plan.skip()
    expect(player.seek).toHaveBeenLastCalledWith(day.readings[1].episode.start)
    expect(lastCall(navigate)).toEqual([["/", "gen", 2]])
    plan.skip()
    plan.skip()
    expect(player.seek).toHaveBeenLastCalledWith(day.reflection)
    expect(plan.stage()).toBe("reflection")
    expect(plan.next()).toBeNull()

    plan.back()
    expect(lastCall(navigate)).toEqual([["/", "psa", 19]])
    plan.back()
    expect(lastCall(navigate)).toEqual([["/", "gen", 2]])
    plan.back()
    expect(lastCall(navigate)).toEqual([["/", "gen", 1]])
    expect(plan.previous()).toBeNull()
  })

  it("marks the day done at its reflection, and goes to the plan's page", () => {
    const plan = create()
    const day = plan.days.find(({ day }) => day === 1) as (typeof plan.days)[0]
    plan.start(day)
    TestBed.tick()
    at(day.reflection + 1)
    expect(plan.stage()).toBe("reflection")
    expect(plan.done()).toEqual([1])
    expect(lastCall(navigate)).toEqual([["/365"]])
    // The reflection's own span: play goes on from here, not a chapter's top.
    expect(player.current()?.start).toBe(day.reflection)
    expect(player.current()?.title).toBe("Reflexão: No princípio")
  })

  it("plays an introduction where it is, done only once heard out", () => {
    const plan = create()
    const intro = plan.days[0]
    plan.start(intro)
    TestBed.tick()
    expect(plan.stage()).toBe("reflection")
    expect(plan.done()).toEqual([])

    at(intro.duration)
    player.current.set(null) // the stream ended
    TestBed.tick()
    expect(plan.done()).toEqual([0])
    expect(plan.active()).toBeNull()
    expect(player.throughEpisode()).toBe(false)
  })

  it("leaves an introduction stopped early not done", () => {
    const plan = create()
    plan.start(plan.days[0])
    TestBed.tick()
    at(60)
    player.current.set(null) // the stream failed
    TestBed.tick()
    expect(plan.done()).toEqual([])
    expect(plan.active()).toBeNull()
  })
})
