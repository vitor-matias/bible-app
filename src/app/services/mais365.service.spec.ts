import { provideHttpClient } from "@angular/common/http"
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing"
import { ApplicationRef, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { apiBaseUrl } from "../config"
import { lastCall } from "../testing/spy-obj"
import { AnalyticsService } from "./analytics.service"
import { BookService } from "./book.service"
import { Mais365Service, type PlanDay, readingLabel } from "./mais365.service"
import {
  type ChapterEpisode,
  PodcastPlayerService,
} from "./podcast-player.service"

const episode = (day: number, url: string, start: number, end: number) => ({
  day,
  title: `Dia ${day}`,
  url,
  start,
  end,
})
/** The plan as bible-api's /v1/mais365 lists it: no verse timings. */
const PLAN: PlanDay[] = [
  {
    day: 0,
    title: "Introdução à Criação do Mundo",
    theme: "Introdução à Criação do Mundo",
    url: "dia0",
    duration: 2269,
    readings: [],
    reflection: 0,
  },
  {
    day: 1,
    title: "No princípio",
    theme: "No princípio",
    priest: "Padre Miguel Vasconcelos",
    url: "dia1",
    duration: 1344,
    readings: [
      {
        bookId: "gen",
        bookName: "Génesis",
        chapter: 1,
        episode: episode(1, "dia1", 58.4, 357.5),
      },
      {
        bookId: "gen",
        bookName: "Génesis",
        chapter: 2,
        episode: episode(1, "dia1", 362.5, 572.86),
      },
      {
        bookId: "psa",
        bookName: "Salmo",
        chapter: 19,
        episode: episode(1, "dia1", 577.32, 688.72),
      },
    ],
    reflection: 688.72,
  },
  {
    day: 3,
    title: "A Arca de Noé",
    theme: "A Arca de Noé",
    url: "dia3",
    duration: 1103,
    readings: [
      {
        bookId: "gen",
        bookName: "Génesis",
        chapter: 5,
        episode: episode(3, "dia3", 56.5, 280.8),
      },
      {
        bookId: "gen",
        bookName: "Génesis",
        chapter: 6,
        episode: episode(3, "dia3", 280.8, 492.1),
      },
      {
        bookId: "pro",
        bookName: "Provérbios",
        chapter: 1,
        range: [1, 7],
        episode: { ...episode(3, "dia3", 492.1, 600), range: [1, 7] },
      },
    ],
    reflection: 600,
  },
  {
    day: 6.5,
    title: "Introdução aos Patriarcas",
    theme: "Introdução aos Patriarcas",
    url: "intro2",
    duration: 2631,
    readings: [],
    reflection: 0,
  },
]
/** A day in full, as /v1/mais365/:day answers: verse timings and all. */
const full = (day: PlanDay): PlanDay => ({
  ...day,
  readings: day.readings.map((reading) => ({
    ...reading,
    episode: { ...reading.episode, verses: [[1, reading.episode.start ?? 0]] },
  })),
})

describe("Mais365Service", () => {
  let player: {
    current: ReturnType<typeof signal<ChapterEpisode | null>>
    position: ReturnType<typeof signal<number>>
    playing: ReturnType<typeof signal<boolean>>
    throughEpisode: ReturnType<typeof signal<boolean>>
    throughFrom: ReturnType<typeof signal<number>>
    mode: ReturnType<typeof signal<string>>
    collapsed: ReturnType<typeof signal<boolean>>
    toggle: ReturnType<typeof vi.fn>
    adopt: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    isCurrent: ReturnType<typeof vi.fn>
    seek?: ReturnType<typeof vi.fn>
  }
  let navigate: ReturnType<typeof vi.fn>

  let http: HttpTestingController
  let track: ReturnType<typeof vi.fn>

  /** The service with the plan loaded, as the plan's page loads it. */
  const create = async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PodcastPlayerService, useValue: player },
        { provide: Router, useValue: { navigate } },
        { provide: BookService, useValue: { findBookById: () => undefined } },
        { provide: AnalyticsService, useValue: { track } },
      ],
    })
    http = TestBed.inject(HttpTestingController)
    const plan = TestBed.inject(Mais365Service)
    plan.load()
    TestBed.tick()
    http.expectOne(`${apiBaseUrl}/mais365`).flush({ days: PLAN })
    await TestBed.inject(ApplicationRef).whenStable()
    return plan
  }
  const find = (plan: Mais365Service, n: number) =>
    plan.days().find(({ day }) => day === n) as PlanDay
  /** start(), its full copy answered. */
  const start = async (plan: Mais365Service, day: PlanDay) => {
    const started = plan.start(day)
    http.expectOne(`${apiBaseUrl}/mais365/${day.day}`).flush(full(day))
    await started
    TestBed.tick()
  }
  const at = (seconds: number) => {
    player.position.set(seconds)
    TestBed.tick()
  }

  beforeEach(() => {
    localStorage.removeItem("mais365Done")
    navigate = vi.fn().mockResolvedValue(true)
    track = vi.fn().mockResolvedValue(undefined)
    player = {
      current: signal<ChapterEpisode | null>(null),
      position: signal(0),
      playing: signal(false),
      throughEpisode: signal(false),
      throughFrom: signal(0),
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

  afterEach(() => {
    localStorage.removeItem("mais365Done")
    http?.verify()
  })

  it("asks for the plan only once its page does", () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    http = TestBed.inject(HttpTestingController)
    const plan = TestBed.inject(Mais365Service)
    TestBed.tick()
    http.expectNone(`${apiBaseUrl}/mais365`)
    expect(plan.today()).toBeUndefined()
  })

  it("plays a day from its full copy, the one read-along follows", async () => {
    const plan = await create()
    await start(plan, find(plan, 1))
    expect(plan.active()?.readings[0].episode.verses).toEqual([[1, 58.4]])
    expect(plan.isActive(find(plan, 1))).toBe(true)
  })

  // Safari lets play() through only within the tap, not a request later.
  it("starts playing within the tap, before the full copy comes", async () => {
    const plan = await create()
    const started = plan.start(find(plan, 1))
    expect(player.toggle).toHaveBeenCalled()
    expect(player.current()?.url).toBe("dia1")
    http.expectOne(`${apiBaseUrl}/mais365/1`).flush(full(find(plan, 1)))
    await started
    TestBed.tick()
    // The reading adopted again, with its timings.
    expect(player.current()?.verses).toEqual([[1, 58.4]])
  })

  // On a slow link the full copy comes once the first reading is well under way.
  it("keeps where a reading was entered when the full copy comes late", async () => {
    const plan = await create()
    const day = find(plan, 1)
    const started = plan.start(day)
    TestBed.tick()
    const first = day.readings[0].episode
    at((first.start as number) + 20)
    http.expectOne(`${apiBaseUrl}/mais365/1`).flush(full(day))
    await started
    TestBed.tick()
    at((first.end as number) - 1)
    at((first.end as number) + 0.5)
    for (const { episode } of day.readings.slice(1)) {
      at(episode.start as number)
      at((episode.end as number) - 1)
      at((episode.end as number) + 0.5)
    }
    expect(plan.done()).toEqual([1])
  })

  // An introduction is all reflection, entered on the light copy already.
  it("tells Umami of a reflection once, when the full copy comes after it", async () => {
    const plan = await create()
    const intro = find(plan, 0)
    const started = plan.start(intro)
    TestBed.tick()
    http.expectOne(`${apiBaseUrl}/mais365/0`).flush(full(intro))
    await started
    TestBed.tick()
    const reflections = track.mock.calls.filter(
      ([name]) => name === "plan_reflection",
    )
    expect(reflections).toEqual([["plan_reflection", { day: 0 }]])
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it("plays the listed copy when the full one can't be had", async () => {
    const plan = await create()
    const started = plan.start(find(plan, 1))
    http
      .expectOne(`${apiBaseUrl}/mais365/1`)
      .flush(null, { status: 500, statusText: "Server Error" })
    await started
    expect(plan.active()).toBe(find(plan, 1))
  })

  it("names a reading of part of a chapter by its verses", async () => {
    const plan = await create()
    expect(readingLabel(find(plan, 3).readings[2])).toBe("Provérbios 1,1-7")
    expect(readingLabel(find(plan, 3).readings[0])).toBe("Génesis 5")
  })

  it("starts with Dia 0, the introduction, and puts each introduction after its day", async () => {
    const plan = await create()
    expect(plan.today()?.day).toBe(0)
    expect(plan.today()?.title).toBe("Introdução à Criação do Mundo")
    expect(plan.days().map(({ day }) => day)).toEqual([0, 1, 3, 6.5])
  })

  it("makes today the first day not done, and remembers what is done", async () => {
    ;(await create()).markDone(0, true)
    TestBed.resetTestingModule()
    const plan = await create()
    expect(plan.today()?.day).toBe(1)
    plan.markDone(0, false)
    expect(plan.today()?.day).toBe(0)
  })

  it("starts afresh when what is stored is not a list of days", async () => {
    localStorage.setItem("mais365Done", "{}")
    expect((await create()).today()?.day).toBe(0)
    TestBed.resetTestingModule()
    localStorage.setItem("mais365Done", '[1, "x", null, 0]')
    expect((await create()).done()).toEqual([1, 0])
  })

  it("starts a day from its first reading even when that reading is paused further on", async () => {
    player.seek = vi.fn()
    const plan = await create()
    const day = find(plan, 1)
    player.isCurrent.mockReturnValue(true)
    await start(plan, day)
    expect(player.seek).toHaveBeenCalledWith(day.readings[0].episode.start)
  })

  it("lets the day go, unmarked and still playing, when another stream is played", async () => {
    const plan = await create()
    const day = find(plan, 3)
    await start(plan, day)
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

  it("names the first reading of a day started while another was at its first", async () => {
    const plan = await create()
    await start(plan, find(plan, 1))
    expect(player.current()?.title).toBe("Génesis 1")
    await start(plan, find(plan, 3))
    expect(player.current()?.title).toBe("Génesis 5")
  })

  it("turns to each reading as the podcast reaches it", async () => {
    const plan = await create()
    const day = find(plan, 1)
    await start(plan, day)
    expect(player.throughEpisode()).toBe(true)
    expect(lastCall(navigate)).toEqual([["/", "gen", 1]])

    at(day.readings[1].episode.start as number)
    expect(lastCall(navigate)).toEqual([["/", "gen", 2]])
    // The full copy's, timings and all.
    expect(player.current()).toEqual({
      ...plan.active()?.readings[1].episode,
      title: "Génesis 2",
    })
    expect(player.current()?.verses).toEqual([[1, 362.5]])

    at(day.readings[2].episode.start as number)
    expect(lastCall(navigate)).toEqual([["/", "psa", 19]])
    expect(plan.done()).toEqual([])
  })

  it("skips to the next reading, and from the last to the reflection", async () => {
    player.seek = vi.fn((seconds: number) => at(seconds))
    const plan = await create()
    const day = find(plan, 1)
    await start(plan, day)
    plan.skip()
    expect(player.seek).toHaveBeenLastCalledWith(day.readings[1].episode.start)
    expect(lastCall(navigate)).toEqual([["/", "gen", 2]])
    plan.skip()
    plan.skip()
    expect(player.seek).toHaveBeenLastCalledWith(day.reflection)
    expect(plan.stage()).toBe("reflection")
    expect(plan.next()).toBeNull()
    // Skipped through, not heard: not read.
    expect(plan.done()).toEqual([])

    expect(player.throughFrom()).toBe(day.reflection)
    plan.back()
    expect(player.throughFrom()).toBe(0)
    expect(lastCall(navigate)).toEqual([["/", "psa", 19]])
    plan.back()
    expect(lastCall(navigate)).toEqual([["/", "gen", 2]])
    plan.back()
    expect(lastCall(navigate)).toEqual([["/", "gen", 1]])
    expect(plan.previous()).toBeNull()
  })

  /** Plays each reading from its start across its end, as listening does. */
  const hearAll = (day: PlanDay) => {
    for (const { episode } of day.readings) {
      at(episode.start as number)
      at((episode.end as number) - 1)
      at((episode.end as number) + 0.5)
    }
  }

  it("marks the day done at its reflection once every reading was heard, and goes to the plan's page", async () => {
    const plan = await create()
    const day = find(plan, 1)
    await start(plan, day)
    hearAll(day)
    at(day.reflection + 1)
    expect(plan.stage()).toBe("reflection")
    expect(plan.done()).toEqual([1])
    expect(lastCall(navigate)).toEqual([["/365"]])
    // The reflection's own span: play goes on from here, not a chapter's top.
    expect(player.current()?.start).toBe(day.reflection)
    expect(player.current()?.title).toBe("Reflexão: No princípio")
    // Back 10 s stays in it.
    expect(player.throughFrom()).toBe(day.reflection)
  })

  it("tells Umami how a day goes: started, its reflection, read by ear or by hand, left", async () => {
    const plan = await create()
    const day = find(plan, 1)
    await start(plan, day)
    expect(track).toHaveBeenCalledWith("plan_day_start", {
      day: 1,
      at: 0,
      from: "plan",
    })
    hearAll(day)
    at(day.reflection + 1)
    expect(track).toHaveBeenCalledWith("plan_reflection", { day: 1 })
    expect(track).toHaveBeenCalledWith("plan_day_done", {
      day: 1,
      how: "heard",
    })
    plan.markDone(1, false)
    expect(track).toHaveBeenLastCalledWith("plan_day_done", {
      day: 1,
      how: "unmarked",
    })
    plan.markDone(3, true)
    expect(track).toHaveBeenLastCalledWith("plan_day_done", {
      day: 3,
      how: "marked",
    })

    await start(plan, find(plan, 3))
    at(100)
    plan.end()
    expect(track).toHaveBeenLastCalledWith("plan_day_end", { day: 3, stage: 0 })
  })

  it("leaves a day unread when a reading was jumped over or landed in late", async () => {
    const plan = await create()
    const day = find(plan, 1)
    await start(plan, day)
    const [first, second, third] = day.readings.map((r) => r.episode)
    at(first.start as number)
    at((first.end as number) - 1)
    at((first.end as number) + 0.5)
    // Scrubbed into the middle of the second: its end crossed, but not heard.
    at((second.start as number) + 60)
    at((second.end as number) - 1)
    at((second.end as number) + 0.5)
    at(third.start as number)
    at((third.end as number) - 1)
    at((third.end as number) + 0.5)
    expect(plan.stage()).toBe("reflection")
    expect(plan.done()).toEqual([])
  })

  it("passes over a reading without timings in ⏮ ⏭ and the stage", async () => {
    player.seek = vi.fn((seconds: number) => at(seconds))
    const plan = await create()
    // Dia 3 with its second reading's heading never found.
    const untimed: PlanDay = {
      ...find(plan, 3),
      readings: find(plan, 3).readings.map((r, i) =>
        i === 1
          ? { ...r, episode: { ...r.episode, start: null, end: null } }
          : r,
      ),
    }
    const started = plan.start(untimed)
    http.expectOne(`${apiBaseUrl}/mais365/3`).flush(full(untimed))
    await started
    TestBed.tick()
    expect(plan.stage()).toBe(0)
    plan.skip()
    expect(player.seek).toHaveBeenLastCalledWith(492.1)
    expect(plan.stage()).toBe(2)
    plan.back()
    expect(player.seek).toHaveBeenLastCalledWith(56.5)
    expect(plan.stage()).toBe(0)
  })

  it("plays an introduction where it is, done only once heard out", async () => {
    const plan = await create()
    const intro = find(plan, 0)
    await start(plan, intro)
    expect(plan.stage()).toBe("reflection")
    expect(plan.done()).toEqual([])
    // Named as itself for the system's player, not as a reflection.
    expect(player.current()?.title).toBe(intro.title)

    at(intro.duration)
    player.current.set(null) // the stream ended
    TestBed.tick()
    expect(plan.done()).toEqual([0])
    expect(plan.active()).toBeNull()
    expect(player.throughEpisode()).toBe(false)
  })

  it("leaves an introduction stopped early not done", async () => {
    const plan = await create()
    await start(plan, find(plan, 0))
    at(60)
    player.current.set(null) // the stream failed
    TestBed.tick()
    expect(plan.done()).toEqual([])
    expect(plan.active()).toBeNull()
  })
})
