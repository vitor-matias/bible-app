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
import {
  localDay,
  Mais365Service,
  type PlanDay,
  planSections,
  readingLabel,
  readingsSummary,
  streakOf,
  streakRun,
} from "./mais365.service"
import {
  type ChapterEpisode,
  PodcastPlayerService,
} from "./podcast-player.service"
import { ToastService } from "./toast.service"

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

describe("the plan's days, for its list", () => {
  it("tells a day's readings in a line, a book's chapters in a row as a span", () => {
    expect(readingsSummary(PLAN[1].readings)).toBe("Génesis 1–2 · Salmo 19")
    // Part of a chapter stands alone, as its own label.
    expect(readingsSummary(PLAN[2].readings)).toBe(
      "Génesis 5–6 · Provérbios 1,1-7",
    )
    expect(readingsSummary([])).toBe("")
  })

  it("sets the days in periods, each opened by its introduction", () => {
    expect(
      planSections(PLAN).map(({ name, days }) => [
        name,
        days.map((d) => d.day),
      ]),
    ).toEqual([
      ["Criação do Mundo", [0, 1, 3]],
      ["Patriarcas", [6.5]],
    ])
    // Days before any introduction: a period without a name.
    expect(planSections(PLAN.slice(1, 3))[0].name).toBe("")
    // A title of another shape is kept whole.
    expect(
      planSections([{ ...PLAN[0], title: "Especial de Natal" }])[0].name,
    ).toBe("Especial de Natal")
  })
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
    stop: ReturnType<typeof vi.fn>
    isCurrent: ReturnType<typeof vi.fn>
    seek?: ReturnType<typeof vi.fn>
  }
  let navigate: ReturnType<typeof vi.fn>
  /** Where the reader is: the plan's page, unless a spec moves it. */
  const router: { url: string; navigate?: ReturnType<typeof vi.fn> } = {
    url: "/mais365",
  }
  const toast = { showOpen: vi.fn(), dismissReturnToPlan: vi.fn() }

  let http: HttpTestingController
  let track: ReturnType<typeof vi.fn>

  /** The service with the plan loaded, as the plan's page loads it. */
  const create = async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PodcastPlayerService, useValue: player },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
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
  /** Played on from `from` to `to`, as timeupdates come (a jump is a scrub). */
  const play = (from: number, to: number) => {
    for (let t = from; t < to; t += 2) at(t)
    at(to)
  }

  beforeEach(() => {
    localStorage.removeItem("mais365Done")
    localStorage.removeItem("mais365Progress")
    navigate = vi.fn().mockResolvedValue(true)
    router.url = "/mais365"
    router.navigate = navigate
    toast.showOpen.mockClear()
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
      stop: vi.fn(() => {
        player.playing.set(false)
        player.current.set(null)
      }),
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
    play(first.start as number, (first.start as number) + 20)
    http.expectOne(`${apiBaseUrl}/mais365/1`).flush(full(day))
    await started
    TestBed.tick()
    play((first.start as number) + 20, (first.end as number) + 0.5)
    for (const { episode } of day.readings.slice(1)) {
      play(episode.start as number, (episode.end as number) + 0.5)
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

  // The reader may have gone elsewhere (back to /mais365, a cross-reference)
  // before the full copy came.
  it("doesn't take the reader back to the reading when the full copy comes", async () => {
    const plan = await create()
    const day = find(plan, 1)
    const started = plan.start(day)
    TestBed.tick()
    const before = navigate.mock.calls.length
    http.expectOne(`${apiBaseUrl}/mais365/1`).flush(full(day))
    await started
    TestBed.tick()
    expect(navigate).toHaveBeenCalledTimes(before)
    // Its timings are taken up all the same.
    expect(player.current()?.verses).toEqual([[1, 58.4]])
  })

  // Dia 7's Provérbios 1,8-19: the book opens at verse 8, not the top.
  it("opens a reading from part of a chapter at its first verse", async () => {
    const plan = await create()
    const day = find(plan, 3)
    const started = plan.start(day, 2)
    http.expectOne(`${apiBaseUrl}/mais365/3`).flush(full(day))
    await started
    TestBed.tick()
    expect(navigate).toHaveBeenCalledWith(["/", "pro", 1], {
      queryParams: { verseStart: 1, highlight: false },
    })
    expect(plan.query(day.readings[0])).toBeNull()
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
      play(episode.start as number, (episode.end as number) + 0.5)
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
    expect(lastCall(navigate)).toEqual([["/mais365"]])
    // The reflection's own span: play goes on from here, not a chapter's top.
    expect(player.current()?.start).toBe(day.reflection)
    expect(player.current()?.title).toBe("Reflexão: No princípio")
    // Back 10 s stays in it.
    expect(player.throughFrom()).toBe(day.reflection)
  })

  // A chapter's ⏮ onto its day's first reading told Umami "plan".
  it("tells Umami a day joined from an episode, at its first reading too", async () => {
    const plan = await create()
    const day = find(plan, 1)
    const started = plan.start(day, 0, "episode")
    http.expectOne(`${apiBaseUrl}/mais365/1`).flush(full(day))
    await started
    expect(track).toHaveBeenCalledWith("plan_day_start", {
      day: 1,
      at: 0,
      from: "episode",
    })
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

  it("tells Umami where a day stopped when its stream ends, and nothing once heard out", async () => {
    const plan = await create()
    const day = find(plan, 1)
    await start(plan, day)
    at((day.readings[1].episode.start as number) + 1)
    // The stream failed (the player forgets it): stage() is null by now.
    player.current.set(null)
    TestBed.tick()
    expect(track).toHaveBeenLastCalledWith("plan_day_end", { day: 1, stage: 1 })

    track.mockClear()
    await start(plan, day)
    hearAll(day)
    at(day.reflection + 1)
    at(day.duration)
    player.current.set(null)
    TestBed.tick()
    expect(track).not.toHaveBeenCalledWith("plan_day_end", expect.anything())
  })

  // Another day started from the plan's page, the browser refusing to play
  // it: its end fell back on the day before's stage («reflection»), so went
  // untold.
  it("tells Umami a new day's end, not the day before's stage", async () => {
    const plan = await create()
    const first = find(plan, 1)
    await start(plan, first)
    hearAll(first)
    at(first.reflection + 1)

    track.mockClear()
    const third = find(plan, 3)
    const started = plan.start(third)
    // play() refused: the player forgets the stream before any of it plays.
    player.current.set(null)
    http.expectOne(`${apiBaseUrl}/mais365/3`).flush(full(third))
    await started
    TestBed.tick()
    expect(track).toHaveBeenLastCalledWith("plan_day_end", {
      day: 3,
      stage: null,
    })
  })

  it("has no days, rather than failing, while the list can't be had", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PodcastPlayerService, useValue: player },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
        { provide: BookService, useValue: { findBookById: () => undefined } },
        { provide: AnalyticsService, useValue: { track } },
      ],
    })
    http = TestBed.inject(HttpTestingController)
    const plan = TestBed.inject(Mais365Service)
    plan.load()
    TestBed.tick()
    http
      .expectOne(`${apiBaseUrl}/mais365`)
      .flush("", { status: 500, statusText: "Server Error" })
    await TestBed.inject(ApplicationRef).whenStable()
    expect(plan.plan.error()).toBeTruthy()
    expect(plan.days()).toEqual([])
    expect(plan.today()).toBeUndefined()
  })

  describe("a reader gone to another chapter", () => {
    it("isn't taken to the next reading, but offered it", async () => {
      const plan = await create()
      const day = find(plan, 1)
      await start(plan, day)
      const [first, second] = day.readings.map((r) => r.episode)
      play(first.start as number, (first.start as number) + 10)
      // On the first reading: followed into the second, in place, so Back
      // leaves the day's chapters for the plan's page.
      router.url = "/gen/1"
      navigate.mockClear()
      play((first.end as number) - 2, (second.start as number) + 1)
      expect(lastCall(navigate)).toEqual([
        ["/", "gen", 2],
        { replaceUrl: true },
      ])

      // Gone to Êxodo 3 meanwhile: left there, the next reading offered.
      router.url = "/ex/3"
      navigate.mockClear()
      const third = day.readings[2].episode
      play((second.end as number) - 2, (third.start as number) + 1)
      expect(navigate).not.toHaveBeenCalled()
      expect(lastCall(toast.showOpen).slice(0, 2)).toEqual([
        "+365 · Agora: Salmo 19",
        "Abrir",
      ])
      lastCall(toast.showOpen)[2]()
      expect(lastCall(navigate)[0]).toEqual(["/", "psa", 19])

      // Nor taken to the plan's page for the reflection.
      router.url = "/ex/3"
      navigate.mockClear()
      play((third.end as number) - 2, day.reflection + 1)
      expect(navigate).not.toHaveBeenCalled()
      expect(lastCall(toast.showOpen)[0]).toBe("+365 · Agora: Reflexão")
    })
  })

  it("takes the way back to the plan down once the day ends", async () => {
    const plan = await create()
    await start(plan, find(plan, 1))
    toast.dismissReturnToPlan.mockClear()
    plan.end()
    expect(toast.dismissReturnToPlan).toHaveBeenCalled()
  })

  // Ester's addition A, stored as Ester 1,1-17: named and opened as printed.
  it("names and opens a reading as printed when the data says", async () => {
    const plan = await create()
    const reading = {
      bookId: "est",
      bookName: "Ester",
      chapter: 1,
      range: [1, 17] as [number, number],
      label: "Ester A",
      verseStart: "A1",
      episode: { day: 274, title: "Dia 274", url: "u", start: 0, end: 10 },
    }
    expect(readingLabel(reading)).toBe("Ester A")
    expect(plan.query(reading)).toEqual({ verseStart: "A1", highlight: false })
    expect(
      readingsSummary([
        reading,
        {
          ...reading,
          chapter: 2,
          range: undefined,
          label: undefined,
          verseStart: undefined,
        },
      ]),
    ).toBe("Ester A · Ester 2")
  })

  describe("checkpoints", () => {
    it("keeps the chapters heard through, and goes on from the next", async () => {
      const plan = await create()
      const day = find(plan, 1)
      await start(plan, day)
      const [first, second] = day.readings.map((r) => r.episode)
      play(first.start as number, (first.end as number) + 0.5)
      play(second.start as number, (second.start as number) + 30)
      plan.end()
      TestBed.tick()
      expect(plan.heardOf(day)).toEqual([0])
      expect(JSON.parse(localStorage.getItem("mais365Progress") ?? "")).toEqual(
        { day: 1, heard: [0] },
      )
      expect(plan.resumeAt(day)).toEqual({ at: 1 })

      // Coming back: from the second chapter, the first still counting.
      player.toggle.mockClear()
      const resuming = plan.start(day, 1)
      http.expectOne(`${apiBaseUrl}/mais365/1`).flush(full(day))
      await resuming
      TestBed.tick()
      expect(lastCall(player.toggle)[0]).toEqual(second)
      play(second.start as number, (second.end as number) + 0.5)
      const third = day.readings[2].episode
      play(third.start as number, (third.end as number) + 0.5)
      expect(plan.stage()).toBe("reflection")
      expect(plan.done()).toEqual([1])
      // Read: nothing left to go on with.
      expect(plan.progress()).toBeNull()
      expect(plan.resumeAt(day)).toBeNull()
    })

    it("forgets them to start over", async () => {
      const plan = await create()
      const day = find(plan, 1)
      await start(plan, day)
      const first = day.readings[0].episode
      play(first.start as number, (first.end as number) + 0.5)
      const restarting = plan.restart(day)
      http.expectOne(`${apiBaseUrl}/mais365/1`).flush(full(day))
      await restarting
      expect(plan.progress()).toBeNull()
      expect(plan.resumeAt(day)).toBeNull()
      expect(player.position()).toBe(0)
    })

    it("offers nothing to go on with before a chapter is heard", async () => {
      const plan = await create()
      expect(plan.resumeAt(find(plan, 1))).toBeNull()
    })
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

  it("leaves a day unread when a reading entered at its start was scrubbed through", async () => {
    const plan = await create()
    const day = find(plan, 1)
    await start(plan, day)
    const [first, ...rest] = day.readings.map((r) => r.episode)
    // Entered at its start, then dragged to just before its end.
    at(first.start as number)
    at((first.end as number) - 1)
    at((first.end as number) + 0.5)
    for (const episode of rest) {
      play(episode.start as number, (episode.end as number) + 0.5)
    }
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

  it("plays an introduction left further on again from its top", async () => {
    const plan = await create()
    const intro = find(plan, 0)
    await start(plan, intro)
    at(300)
    plan.end()
    player.seek = vi.fn()
    player.isCurrent.mockReturnValue(true)
    player.playing.set(false)
    player.toggle.mockClear()
    await start(plan, intro)
    expect(player.seek).toHaveBeenCalledWith(0)
    expect(player.toggle).toHaveBeenCalledTimes(1)
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

  describe("the days read in a row", () => {
    const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 21)

    it("counts back from today, or from yesterday while today is to come", () => {
      const read = ["2026-11-24", "2026-11-25", "2026-11-26"]
      expect(streakOf(read, on(2026, 11, 26))).toBe(3)
      expect(streakOf(read, on(2026, 11, 27))).toBe(3)
      // A day gone by without one: over.
      expect(streakOf(read, on(2026, 11, 28))).toBe(0)
      expect(streakOf(["2026-11-24", "2026-11-26"], on(2026, 11, 26))).toBe(1)
    })

    it("runs over a month's end and a year's", () => {
      const read = ["2026-12-30", "2026-12-31", "2027-01-01"]
      expect(streakOf(read, on(2027, 1, 1))).toBe(3)
    })

    // Days read before the streak came have no date: they don't count.
    it("dates each day as read, keeps the first date, and forgets it unmarked", async () => {
      localStorage.removeItem("mais365DoneOn")
      const plan = await create()
      plan.markDone(1, true)
      plan.markDone(2, true)
      const today = localDay(new Date())
      expect(plan.doneOn()).toEqual({ 1: today, 2: today })
      expect(plan.streak()).toBe(1)
      expect(JSON.parse(localStorage.getItem("mais365DoneOn") ?? "{}")).toEqual(
        { 1: today, 2: today },
      )
      localStorage.removeItem("mais365DoneOn")
    })

    describe("unmarking and the clock", () => {
      afterEach(() => {
        localStorage.removeItem("mais365DoneOn")
        localStorage.removeItem("mais365Done")
      })
      const readOn = (days: Record<number, string>) => {
        localStorage.setItem(
          "mais365Done",
          JSON.stringify(Object.keys(days).map(Number)),
        )
        localStorage.setItem("mais365DoneOn", JSON.stringify(days))
      }

      it("keeps a streak over a mis-tap: unmarking drops the day, marking it again restores its date", async () => {
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
        vi.setSystemTime(new Date(2026, 10, 26, 10))
        readOn({ 1: "2026-11-23", 2: "2026-11-24", 3: "2026-11-25" })
        const plan = await create()
        expect(plan.streak()).toBe(3)
        plan.markDone(3, false)
        expect(plan.streak()).toBe(0)
        plan.markDone(3, true)
        expect(plan.doneOn()[3]).toBe("2026-11-25")
        expect(plan.streak()).toBe(3)
      })

      it("keeps the run over a midnight with nothing read, ends it at the second", async () => {
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
        vi.setSystemTime(new Date(2026, 10, 26, 23, 59))
        readOn({ 1: "2026-11-25", 2: "2026-11-26" })
        const plan = await create()
        expect(plan.streak()).toBe(2)
        await vi.advanceTimersByTimeAsync(60_000)
        expect(plan.clockDay()).toBe("2026-11-27")
        expect(plan.streak()).toBe(2)
        await vi.advanceTimersByTimeAsync(24 * 3600_000)
        expect(plan.clockDay()).toBe("2026-11-28")
        expect(plan.streak()).toBe(0)
      })

      it("recomputes when the app becomes visible again", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date(2026, 10, 26, 10))
        readOn({ 1: "2026-11-26" })
        const plan = await create()
        vi.setSystemTime(new Date(2026, 10, 28, 10))
        document.dispatchEvent(new Event("visibilitychange"))
        expect(plan.clockDay()).toBe("2026-11-28")
        expect(plan.streak()).toBe(0)
      })
    })

    it("keeps the dates over a restart, and drops what isn't one", async () => {
      localStorage.setItem(
        "mais365DoneOn",
        JSON.stringify({ 1: "2026-11-25", 2: "yesterday", x: "2026-11-25" }),
      )
      const plan = await create()
      expect(plan.doneOn()).toEqual({ 1: "2026-11-25" })
      localStorage.removeItem("mais365DoneOn")
    })
  })

  describe("a streak's milestones", () => {
    const dated = (days: number) => {
      const out: Record<number, string> = {}
      localStorage.setItem(
        "mais365Done",
        JSON.stringify(Array.from({ length: days }, (_, i) => i + 1)),
      )
      for (let i = 0; i < days; i++) {
        const day = new Date()
        day.setDate(day.getDate() - i)
        out[i + 1] = localDay(day)
      }
      return out
    }
    afterEach(() => {
      localStorage.removeItem("mais365DoneOn")
      localStorage.removeItem("mais365Done")
      localStorage.removeItem("mais365Celebrated")
    })

    it("dates a run by its first day", () => {
      const read = ["2026-11-24", "2026-11-25", "2026-11-26"]
      expect(streakRun(read, new Date(2026, 10, 26, 21))).toEqual({
        length: 3,
        start: "2026-11-24",
      })
      expect(streakRun([], new Date(2026, 10, 26))).toEqual({
        length: 0,
        start: null,
      })
    })

    it("calls a milestone once, then not again for the same run", async () => {
      localStorage.setItem("mais365DoneOn", JSON.stringify(dated(7)))
      const plan = await create()
      expect(plan.milestone()?.days).toBe(7)
      plan.celebrate(plan.milestone()?.key ?? "")
      expect(plan.milestone()).toBeNull()
      expect(track).toHaveBeenCalledWith("plan_streak_milestone", { days: 7 })
      // Kept over a restart.
      TestBed.resetTestingModule()
      const again = await create()
      expect(again.milestone()).toBeNull()
    })

    it("calls nothing between milestones", async () => {
      localStorage.setItem("mais365DoneOn", JSON.stringify(dated(8)))
      expect((await create()).milestone()).toBeNull()
    })
  })

  // The reminder asks whether today was read: a day unmarked keeps its date
  // for the streak, but isn't read.
  it("gives the latest date among the days still read", async () => {
    localStorage.setItem(
      "mais365DoneOn",
      JSON.stringify({ 1: "2026-11-20", 2: "2026-11-25" }),
    )
    localStorage.setItem("mais365Done", JSON.stringify([1, 2]))
    const plan = await create()
    expect(plan.lastReadOn()).toBe("2026-11-25")
    plan.markDone(2, false)
    expect(plan.lastReadOn()).toBe("2026-11-20")
    plan.markDone(1, false)
    expect(plan.lastReadOn()).toBeNull()
    localStorage.removeItem("mais365DoneOn")
    localStorage.removeItem("mais365Done")
  })

  // Episodes open with the podcast's welcome: heard first from «Ouvir e
  // ler», with a way past it.
  describe("the episode's intro", () => {
    const startWithIntro = async (plan: Mais365Service, day: PlanDay) => {
      const started = plan.start(day, 0, "plan", true)
      http.expectOne(`${apiBaseUrl}/mais365/${day.day}`).flush(full(day))
      await started
      TestBed.tick()
    }

    it("plays from the episode's start on the plan's page, the reading opened once it begins", async () => {
      const plan = await create()
      const day = find(plan, 1)
      navigate.mockClear()
      await startWithIntro(plan, day)
      const first = day.readings[0].episode
      expect(player.position()).toBe(0)
      // Up to the first reading, named as the intro.
      expect(lastCall(player.toggle)[0]).toEqual({
        ...first,
        start: 0,
        end: first.start,
        title: "Introdução",
      })
      expect(plan.stage()).toBeNull()
      expect(plan.introUntil()).toBe(first.start)
      // Heard where it was started, as the reflection: no chapter yet.
      expect(navigate).not.toHaveBeenCalled()
      // ⏭ goes past it to the first reading, which opens.
      player.seek = vi.fn((seconds: number) => at(seconds))
      plan.skip()
      expect(player.seek).toHaveBeenCalledWith(first.start)
      expect(plan.stage()).toBe(0)
      expect(plan.introUntil()).toBeNull()
      expect(navigate).toHaveBeenCalledTimes(1)
    })

    it("plays the intro again from the top after «Terminar»", async () => {
      const plan = await create()
      const day = find(plan, 1)
      await startWithIntro(plan, day)
      at(30)
      plan.end()
      const intro = { ...day.readings[0].episode, start: 0 }
      player.seek = vi.fn()
      player.isCurrent.mockImplementation(
        (e: ChapterEpisode) => e.url === intro.url && e.start === intro.start,
      )
      player.playing.set(false)
      await startWithIntro(plan, day)
      expect(player.seek).toHaveBeenCalledWith(0)
    })

    it("starts at the reading itself otherwise (⏮ ⏭, a chapter's episode)", async () => {
      const plan = await create()
      const day = find(plan, 1)
      await start(plan, day)
      expect(plan.introUntil()).toBeNull()
      expect(player.position()).toBe(day.readings[0].episode.start)
    })
  })
})
