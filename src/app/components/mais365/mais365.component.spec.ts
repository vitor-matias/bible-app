import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatDialog } from "@angular/material/dialog"
import { provideRouter, Router } from "@angular/router"
import { page } from "vitest/browser"
import {
  localDay,
  Mais365Service,
  type PlanDay,
} from "../../services/mais365.service"
import { Mais365ReminderService } from "../../services/mais365-reminder.service"
import { PodcastPlayerService } from "../../services/podcast-player.service"
import { ToastService } from "../../services/toast.service"
import { Mais365Component } from "./mais365.component"

const reading = (bookId: string, bookName: string, chapter: number) => ({
  bookId,
  bookName,
  chapter,
  episode: { day: 1, title: "Dia 1", url: "u1", start: 0, end: 10 },
})
const intro: PlanDay = {
  day: 0,
  title: "Introdução à Criação do Mundo",
  theme: "Introdução à Criação do Mundo",
  priest: "Padre Miguel Vasconcelos e o Padre Francisco Molho",
  url: "u0",
  duration: 2269,
  readings: [],
  reflection: 0,
}
const day1: PlanDay = {
  day: 1,
  title: "No princípio",
  theme: "No princípio",
  priest: "Padre Miguel Vasconcelos",
  url: "u1",
  duration: 1344,
  readings: [
    reading("gen", "Génesis", 1),
    reading("gen", "Génesis", 2),
    reading("psa", "Salmo", 19),
  ],
  reflection: 688.72,
}

describe("Mais365Component", () => {
  let fixture: ComponentFixture<Mais365Component>
  const resource = {
    isLoading: signal(false),
    error: signal<unknown>(undefined),
    reload: vi.fn(),
  }
  const plan = {
    plan: resource,
    days: signal<PlanDay[]>([intro, day1]),
    load: vi.fn(),
    isActive: (day: PlanDay | undefined) =>
      !!day && plan.active()?.day === day.day,
    done: signal<number[]>([]),
    lastReadOn: signal<string | undefined>(undefined),
    clockDay: signal(localDay(new Date())),
    streak: signal(0),
    milestone: signal<{ days: number; key: string } | null>(null),
    celebrate: vi.fn(),
    today: signal(intro),
    active: signal<PlanDay | null>(null),
    stage: signal<number | "reflection" | null>(null),
    previous: signal<PlanDay["readings"][0] | null>(null),
    next: signal<PlanDay["readings"][0] | "reflection" | null>(null),
    introUntil: signal<number | null>(null),
    skip: vi.fn(),
    back: vi.fn(),
    link: (reading: PlanDay["readings"][0]) => [
      "/",
      reading.bookId,
      reading.chapter,
    ],
    query: () => null,
    start: vi.fn(),
    restart: vi.fn(),
    heardOf: vi.fn((_day: PlanDay): number[] => []),
    resumeAt: vi.fn((_day: PlanDay): { at: number } | null => null),
    end: vi.fn(),
    toggle: vi.fn(),
    markDone: vi.fn(),
  }
  const player = {
    position: signal(0),
    playing: signal(false),
    rate: signal(1),
    seek: vi.fn(),
    skip: vi.fn(),
    cycleRate: vi.fn(),
  }
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? ""
  const button = (label: string) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        "button, a",
      ),
    ).find(
      (el) =>
        el.getAttribute("aria-label") === label ||
        el.textContent?.trim().endsWith(label) ||
        // A day's row: its title, over its readings.
        el.querySelector(".day-title")?.textContent === label,
    )

  beforeEach(() => {
    plan.days.set([intro, day1])
    plan.today.set(intro)
    plan.done.set([])
    plan.lastReadOn.set(undefined)
    plan.clockDay.set(localDay(new Date()))
    plan.streak.set(0)
    plan.milestone.set(null)
    resource.isLoading.set(false)
    resource.error.set(undefined)
    plan.active.set(null)
    plan.stage.set(null)
    plan.next.set(null)
    plan.introUntil.set(null)
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Mais365Service, useValue: plan },
        { provide: PodcastPlayerService, useValue: player },
        {
          provide: Mais365ReminderService,
          useValue: {
            enabled: signal(false),
            busy: signal(false),
            problem: signal(null),
            time: signal("08:00"),
            unsupported: null,
          },
        },
      ],
    })
    fixture = TestBed.createComponent(Mais365Component)
    fixture.detectChanges()
  })

  // EJNS's own cover and words, with the podcast credited.
  it("leads with the podcast's cover and a credit to EJNS", () => {
    const host: HTMLElement = fixture.nativeElement
    const cover = host.querySelector(".cover") as HTMLImageElement
    expect(cover.getAttribute("src")).toBe("imgs/mais365-cover.jpg")
    expect(cover.alt).toContain("a Bíblia inteira, um dia de cada vez")
    expect(host.querySelector(".intro")?.textContent).toContain("73 livros")
    const credit = host.querySelector(".credit") as HTMLAnchorElement
    expect(credit.href).toBe("https://ejns.pt/mais365/")
    expect(credit.target).toBe("_blank")
  })

  // A card of its own took room at the top: a bell in the corner opens it.
  it("offers the daily reminder behind a bell, not in a card on the page", async () => {
    const host: HTMLElement = fixture.nativeElement
    expect(host.querySelector("mais365-reminder")).toBeNull()
    const bell = host.querySelector(".lead .bell") as HTMLButtonElement
    expect(bell.getAttribute("aria-label")).toBe("Notificação diária")
    // Struck through while off.
    expect(bell.textContent?.trim()).toBe("notifications_off")
    bell.click()
    await fixture.whenStable()
    expect(
      document.querySelector(".mais365-reminder-dialog mais365-reminder"),
    ).not.toBeNull()
    TestBed.inject(MatDialog).closeAll()
  })

  it("keeps a day just marked read on the card, to show it and to undo it", () => {
    plan.today.set(day1)
    plan.days.set([intro, day1, { ...day1, day: 2, title: "Dia 2" }])
    fixture.detectChanges()
    // As the service: marked, today moves on to the next day.
    plan.markDone.mockImplementationOnce((day: number) => {
      plan.done.set([day])
      plan.today.set({ ...day1, day: 2, title: "Dia 2" })
    })
    button("Marcar como lido")?.click()
    fixture.detectChanges()
    expect(text()).toContain("Lido ✓")
    expect(button("Marcar como não lido")).toBeDefined()
  })

  // On day 120, the list opened at day 1: the days before now fold away.
  it("opens the list at the next day to read, the days before a tap away", () => {
    const days = Array.from({ length: 6 }, (_, i) => ({
      ...day1,
      day: i + 1,
      title: `Dia ${i + 1}`,
    }))
    const rows = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(".day-number"),
        (row) => row.textContent?.trim(),
      )
    plan.days.set([intro, ...days])
    plan.today.set(days[4])
    fixture.detectChanges()
    // Dia 5 next: the two before it, then on. As many told as open.
    expect(rows()).toEqual(["Dia 3", "Dia 4", "Dia 5", "Dia 6"])
    button("Mostrar os 3 dias anteriores")?.click()
    fixture.detectChanges()
    expect(rows()).toEqual([
      "Dia 0",
      "Dia 1",
      "Dia 2",
      "Dia 3",
      "Dia 4",
      "Dia 5",
      "Dia 6",
    ])
    // The row folds them again.
    expect(text()).toContain("Ocultar os dias anteriores")
  })

  // Only an introduction before the fold: said as what it is, not «0 dias».
  it("tells introductions alone as introductions", () => {
    plan.days.set([
      intro,
      ...[1, 2, 3].map((day) => ({ ...day1, day, title: `Dia ${day}` })),
    ])
    plan.today.set({ ...day1, day: 3, title: "Dia 3" })
    fixture.detectChanges()
    expect(text()).toContain("Mostrar as introduções anteriores")
  })

  // Today falls back on the last day once all are read: it folded all but
  // the last three.
  it("folds nothing once every day is read", () => {
    const days = [1, 2, 3, 4, 5].map((day) => ({
      ...day1,
      day,
      title: `Dia ${day}`,
    }))
    plan.days.set([intro, ...days])
    plan.done.set([0, 1, 2, 3, 4, 5])
    plan.today.set(days[4])
    fixture.detectChanges()
    expect(text()).not.toContain("Mostrar")
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(".day").length,
    ).toBe(6)
  })

  it("tells the rows it folds, and folds none at the start", () => {
    plan.days.set([
      intro,
      ...[1, 2, 3, 4].map((day) => ({ ...day1, day, title: `Dia ${day}` })),
    ])
    plan.today.set({ ...day1, day: 4, title: "Dia 4" })
    fixture.detectChanges()
    expect(text()).toContain("Mostrar os 2 dias anteriores")
    plan.today.set(intro)
    fixture.detectChanges()
    expect(text()).not.toContain("Mostrar")
  })

  describe("sharing a day", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("shares its name, its readings and a link that opens it", async () => {
      const share = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, share })
      // canShare is read as the page opens: a page of its own.
      fixture = TestBed.createComponent(Mais365Component)
      fixture.detectChanges()
      button("No princípio")?.click()
      fixture.detectChanges()
      button("Partilhar o dia")?.click()
      await fixture.whenStable()
      expect(share).toHaveBeenCalledWith({
        title: "+365",
        text: "Dia 1 do +365: «No princípio» (Génesis 1–2 · Salmo 19).",
        url: `${window.location.origin}/mais365?dia=1`,
      })
    })

    // Firefox on a desktop has no share sheet: the link, copied.
    it("copies the link where there is no share sheet", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", {
        ...navigator,
        share: undefined,
        clipboard: { writeText },
      })
      const show = vi.spyOn(TestBed.inject(ToastService), "show")
      fixture = TestBed.createComponent(Mais365Component)
      fixture.detectChanges()
      button("Partilhar o dia")?.click()
      await fixture.whenStable()
      expect(writeText).toHaveBeenCalledWith(
        `+365: «Introdução à Criação do Mundo». ${window.location.origin}/mais365?dia=0`,
      )
      expect(show).toHaveBeenCalledWith("Ligação copiada.")
    })

    it("opens the day a shared link names", () => {
      vi.spyOn(TestBed.inject(Router), "url", "get").mockReturnValue(
        "/mais365?dia=1",
      )
      fixture = TestBed.createComponent(Mais365Component)
      fixture.detectChanges()
      TestBed.tick()
      fixture.detectChanges()
      expect(
        (fixture.nativeElement as HTMLElement).querySelector("#day-title")
          ?.textContent,
      ).toBe("No princípio")
    })

    // Number("") is 0: a cut-off link opened Dia 0, not the next day.
    it("opens the next day for an empty «?dia=»", () => {
      plan.today.set(day1)
      vi.spyOn(TestBed.inject(Router), "url", "get").mockReturnValue(
        "/mais365?dia=",
      )
      fixture = TestBed.createComponent(Mais365Component)
      fixture.detectChanges()
      TestBed.tick()
      fixture.detectChanges()
      expect(
        (fixture.nativeElement as HTMLElement).querySelector("#day-title")
          ?.textContent,
      ).toBe("No princípio")
    })
  })

  // A week in a row: celebrated once, with a way to share it.
  describe("a streak's milestone", () => {
    afterEach(() => vi.unstubAllGlobals())

    const dialog = () =>
      document.querySelector("streak-milestone") as HTMLElement | null
    const inDialog = (label: string) =>
      Array.from(
        dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      ).find((b) => b.textContent?.includes(label))

    it("celebrates it, and is done with it once closed", async () => {
      plan.milestone.set({ days: 7, key: "2026-11-20:7" })
      TestBed.tick()
      await fixture.whenStable()
      expect(dialog()?.textContent).toContain("7 dias seguidos")
      expect(dialog()?.textContent).toContain(
        "Uma semana inteira com a Palavra.",
      )
      inDialog("Continuar")?.click()
      await vi.waitFor(() => expect(dialog()).toBeNull())
      expect(plan.celebrate).toHaveBeenCalledWith("2026-11-20:7")
    })

    it("shares the days in a row from it", async () => {
      const share = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, share })
      plan.milestone.set({ days: 30, key: "2026-10-28:30" })
      TestBed.tick()
      await fixture.whenStable()
      inDialog("Partilhar")?.click()
      await vi.waitFor(() =>
        expect(share).toHaveBeenCalledWith({
          title: "+365",
          text: "Há 30 dias seguidos que leio a Bíblia com o +365.",
          url: `${window.location.origin}/mais365`,
        }),
      )
      expect(plan.celebrate).toHaveBeenCalledWith("2026-10-28:30")
    })
  })

  // A run of one isn't one yet.
  it("tells the days read in a row, from two", () => {
    expect(text()).not.toContain("seguidos")
    plan.streak.set(1)
    fixture.detectChanges()
    expect(text()).not.toContain("seguidos")
    plan.streak.set(3)
    fixture.detectChanges()
    expect(text()).toContain("3 dias seguidos")
  })

  // Against the days out so far: 365 once the year is all published.
  it("tells how far into the published days the reader is, introductions apart", () => {
    const progress = () =>
      (fixture.nativeElement as HTMLElement).querySelector(
        "progress",
      ) as HTMLProgressElement
    plan.days.set([intro, day1, { ...day1, day: 2, title: "Dia 2" }])
    fixture.detectChanges()
    expect(text()).toContain("0 de 2 dias lidos")
    plan.done.set([0, 1])
    fixture.detectChanges()
    expect(text()).toContain("1 de 2 dias lidos")
    expect(progress().value).toBe(1)
    expect(progress().max).toBe(2)
  })

  it("lists the days by period, each with what was read", () => {
    const patriarchs = {
      ...intro,
      day: 6.5,
      title: "Introdução aos Patriarcas",
    }
    plan.days.set([
      intro,
      day1,
      patriarchs,
      { ...day1, day: 7, title: "Abrão" },
    ])
    plan.done.set([0, 1])
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const periods = Array.from(host.querySelectorAll(".period h3"), (h) =>
      h.textContent?.replace(/\s+/g, " ").trim(),
    )
    // Introductions are listed but not counted, as in «x de N dias lidos».
    expect(periods).toEqual([
      "Criação do Mundo 1/1 lidos",
      "Patriarcas 0/1 lidos",
    ])
    expect(host.querySelector(".day-summary")?.textContent).toBe(
      "Génesis 1–2 · Salmo 19",
    )
    // No way to jump to a period: the plan is followed, a day at a time.
    expect(host.querySelector(".period-chip")).toBeNull()
  })

  it("marks the next day to read and the day being heard in the list, in words too", () => {
    const state = (title: string) =>
      button(title)?.querySelector(".day-state")?.textContent
    plan.today.set(day1)
    plan.done.set([0])
    fixture.detectChanges()
    expect((button("No princípio") as HTMLElement).classList).toContain("next")
    expect(state("No princípio")).toBe("a seguir")
    expect(state("Introdução à Criação do Mundo")).toBe("lido")
    plan.active.set(day1)
    fixture.detectChanges()
    expect(state("No princípio")).toBe("a ouvir")
  })

  // One column: the card stays over the list, so a day picked changes it
  // there; the page keeps its place in the list.
  it("shows a day picked in the card that stays, on a narrow screen", async () => {
    await page.viewport(390, 800)
    try {
      const scrollTo = vi.spyOn(window, "scrollTo")
      const scrollBy = vi.spyOn(window, "scrollBy")
      button("No princípio")?.click()
      fixture.detectChanges()
      await fixture.whenStable()
      expect(
        (fixture.nativeElement as HTMLElement).querySelector("#day-title")
          ?.textContent,
      ).toBe("No princípio")
      expect(scrollTo).not.toHaveBeenCalled()
      expect(scrollBy).not.toHaveBeenCalled()
    } finally {
      await page.viewport(800, 600)
    }
  })

  it("asks for the plan, and says so while it loads or when it can't", () => {
    expect(plan.load).toHaveBeenCalled()
    plan.days.set([])
    resource.isLoading.set(true)
    fixture.detectChanges()
    expect(text()).toContain("A carregar o plano…")
    resource.isLoading.set(false)
    resource.error.set(new Error("offline"))
    fixture.detectChanges()
    expect(text()).toContain("Não foi possível carregar o plano")
    button("Tentar novamente")?.click()
    expect(resource.reload).toHaveBeenCalled()
  })

  it("shows today's introduction, its priests, and plays it with «Ouvir»", () => {
    expect(text()).toContain("Dia 0 · Hoje")
    expect(text()).toContain("38 min")
    expect(text()).toContain(
      "Com o Padre Miguel Vasconcelos e o Padre Francisco Molho",
    )
    button("Ouvir")?.click()
    expect(plan.start).toHaveBeenCalledWith(intro, 0, "plan", true)
  })

  // Off to a chapter from the card, the reader had no way back to the plan.
  it("offers the way back to the plan from a reading opened on the card", () => {
    const back = vi
      .spyOn(TestBed.inject(ToastService), "showReturnToPlan")
      .mockImplementation(() => {})
    // No routes here: the link's navigation, rejected, failed CI's whole run.
    vi.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true)
    button("No princípio")?.click()
    fixture.detectChanges()
    ;(
      (fixture.nativeElement as HTMLElement).querySelector(
        ".card.today .readings a",
      ) as HTMLAnchorElement
    ).click()
    expect(back).toHaveBeenCalled()
  })

  // Read alone from its rows: «Ler sem áudio» said what the first did.
  it("lists a picked day's readings, to hear and read or read alone", () => {
    button("No princípio")?.click()
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    expect(
      Array.from(host.querySelectorAll(".readings a"), (a) =>
        a.getAttribute("href"),
      ),
    ).toEqual(["/gen/1", "/gen/2", "/psa/19"])
    expect(button("Ler sem áudio")).toBeUndefined()
    button("Ouvir e ler")?.click()
    expect(plan.start).toHaveBeenCalledWith(day1, 0, "plan", true)
  })

  // The bell set into the corner made the column scroll sideways.
  it("doesn't let the side column scroll sideways in two columns", async () => {
    await page.viewport(1380, 640)
    try {
      fixture.detectChanges()
      const side = (fixture.nativeElement as HTMLElement).querySelector(
        ".side",
      ) as HTMLElement
      expect(side.scrollWidth).toBeLessThanOrEqual(side.clientWidth)
    } finally {
      await page.viewport(800, 600)
    }
  })

  // Left part-heard: its chapters heard ticked, and the choice to go on or over.
  it("goes on from the first chapter not heard, or starts over", () => {
    plan.days.set([day1])
    plan.today.set(day1)
    plan.heardOf.mockImplementation((day) => (day.day === 1 ? [0] : []))
    plan.resumeAt.mockImplementation((day) =>
      day.day === 1 ? { at: 1 } : null,
    )
    try {
      fixture.detectChanges()
      const host = fixture.nativeElement as HTMLElement
      expect(
        Array.from(host.querySelectorAll(".readings li"), (li) =>
          li.classList.contains("passed"),
        ).slice(0, 3),
      ).toEqual([true, false, false])
      expect(button("Ouvir e ler")).toBeUndefined()
      button("Continuar")?.click()
      expect(plan.start).toHaveBeenCalledWith(day1, 1, "plan")
      button("Recomeçar")?.click()
      expect(plan.restart).toHaveBeenCalledWith(day1)
    } finally {
      plan.heardOf.mockImplementation(() => [])
      plan.resumeAt.mockImplementation(() => null)
    }
  })

  // Listening named, the rest as icons: the card's row never wraps.
  it("keeps the day's actions in one row on a phone, marked read in its icon", async () => {
    await page.viewport(390, 844)
    try {
      button("No princípio")?.click()
      fixture.detectChanges()
      const host = fixture.nativeElement as HTMLElement
      const tops = new Set(
        Array.from(host.querySelectorAll(".today .actions button"), (b) =>
          Math.round(b.getBoundingClientRect().top),
        ),
      )
      expect(tops.size).toBe(1)
      button("Marcar como lido")?.click()
      expect(plan.markDone).toHaveBeenCalledWith(1, true)
      plan.done.set([1])
      fixture.detectChanges()
      expect(host.querySelector(".mark.done")).not.toBeNull()
      expect(button("Marcar como não lido")).toBeDefined()
    } finally {
      await page.viewport(800, 600)
    }
  })

  // Another day picked during a reflection: the two cards touched.
  it("sets another day's card apart from the reflection's", () => {
    plan.active.set(day1)
    plan.stage.set("reflection")
    player.position.set(700)
    fixture.detectChanges()
    button("Introdução à Criação do Mundo")?.click()
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const reflection = (
      host.querySelector(".reflection") as HTMLElement
    ).getBoundingClientRect()
    const picked = (
      host.querySelector(".today") as HTMLElement
    ).getBoundingClientRect()
    expect(picked.top - reflection.bottom).toBeGreaterThanOrEqual(16)
  })

  // «Ouvir e ler» opens with the episode's welcome: heard here, as the reflection.
  it("plays the episode's intro on the page, with a way past it", () => {
    plan.active.set(day1)
    plan.introUntil.set(58.4)
    plan.next.set(day1.readings[0])
    player.position.set(10)
    fixture.detectChanges()
    expect(text()).toContain("Dia 1 · Introdução")
    expect(text()).toContain("−0:48")
    const slider = (fixture.nativeElement as HTMLElement).querySelector(
      "input[matSliderThumb]",
    ) as HTMLInputElement
    expect(slider.min).toBe("0")
    expect(slider.max).toBe("58.4")
    expect(slider.getAttribute("aria-label")).toBe("Posição na introdução")
    button("Saltar para Génesis 1")?.click()
    expect(plan.skip).toHaveBeenCalled()
    // The day's own card isn't shown under it twice.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector("#day-title"),
    ).toBeNull()
  })

  // Ended (✕): the card stays on that day, not the earliest unread one.
  it("keeps the day just left on the card", () => {
    plan.days.set([intro, day1])
    plan.today.set(intro)
    plan.active.set(day1)
    plan.stage.set(0)
    fixture.detectChanges()
    plan.active.set(null)
    plan.stage.set(null)
    fixture.detectChanges()
    expect(
      (fixture.nativeElement as HTMLElement).querySelector("#day-title")
        ?.textContent,
    ).toBe(day1.title)
  })

  // start() swaps the day's light copy for its full one when that loads.
  it("keeps a day picked while the playing day's full copy loads", () => {
    plan.active.set(day1)
    plan.stage.set("reflection")
    fixture.detectChanges()
    button("Introdução à Criação do Mundo")?.click()
    fixture.detectChanges()
    plan.active.set({ ...day1 })
    fixture.detectChanges()
    expect(
      (fixture.nativeElement as HTMLElement).querySelector("#day-title")
        ?.textContent,
    ).toBe("Introdução à Criação do Mundo")
  })

  it("shows the reflection with its priest and readings, to move through", () => {
    plan.active.set(day1)
    plan.stage.set("reflection")
    player.position.set(700)
    fixture.detectChanges()
    expect(text()).toContain("Dia 1 · Reflexão")
    expect(text()).toContain("Com o Padre Miguel Vasconcelos")
    expect(text()).toContain("Leituras:")
    expect(text()).toContain("Génesis 2")
    expect(text()).toContain("−10:44")

    plan.previous.set(day1.readings[2])
    fixture.detectChanges()
    button("Voltar a Salmo 19")?.click()
    expect(plan.back).toHaveBeenCalled()
    // Back 15 s near its start stays in the reflection.
    player.position.set(692)
    button("Recuar 15 segundos")?.click()
    expect(player.seek).toHaveBeenLastCalledWith(688.72)

    button("Avançar 15 segundos")?.click()
    expect(player.skip).toHaveBeenCalledWith(15)
    const slider = (fixture.nativeElement as HTMLElement).querySelector(
      "input[matSliderThumb]",
    ) as HTMLInputElement
    expect(slider.min).toBe("688.72")
    expect(slider.max).toBe("1344")
    // Said as the times beside it show it: into the reflection, not the day.
    fixture.detectChanges()
    expect(slider.getAttribute("aria-valuetext")).toBe("0:03 de 10:55")
    expect(button("Velocidade do +365")?.textContent?.trim()).toBe("1×")
    button("Velocidade do +365")?.click()
    expect(player.cycleRate).toHaveBeenCalled()
    button("Terminar")?.click()
    expect(plan.end).toHaveBeenCalled()

    // Another day picked (here today's, Dia 0): shown under the player.
    button("No princípio")?.click()
    fixture.detectChanges()
    const picked = () =>
      (fixture.nativeElement as HTMLElement).querySelector("#day-title")
        ?.textContent
    expect(picked()).toBeUndefined()
    button("Introdução à Criação do Mundo")?.click()
    fixture.detectChanges()
    expect(text()).toContain("Dia 1 · Reflexão")
    expect(picked()).toBe("Introdução à Criação do Mundo")
  })

  describe("a way back to the next day to read", () => {
    const days = Array.from({ length: 80 }, (_, i) => ({
      ...day1,
      day: i + 1,
      title: `Dia ${i + 1}`,
    }))
    const pill = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        ".to-next",
      )

    beforeEach(() => {
      plan.days.set([intro, ...days])
      fixture.detectChanges()
    })

    afterEach(() => window.scrollTo(0, 0))

    it("shows once the next day is scrolled away, and takes the reader back", async () => {
      plan.today.set(days[2])
      fixture.detectChanges()
      await fixture.whenStable()
      expect(pill()).toBeNull()

      window.scrollTo(0, document.documentElement.scrollHeight)
      await vi.waitFor(() => {
        fixture.detectChanges()
        expect(pill()?.textContent).toContain("Dia 3")
      })
      expect(pill()?.textContent).toContain("arrow_upward")

      const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
      button("Dia 5")?.click()
      pill()?.click()
      fixture.detectChanges()
      // Up, all the way: its row is in sight at the page's top, and stopping
      // short left the title half under the bar.
      expect(scroll).toHaveBeenLastCalledWith(
        expect.objectContaining({ top: 0 }),
      )
      // Its card too, in place of the day picked.
      expect(text()).toContain("Dia 3 · Hoje")
    })

    // On a phone the day's card stays over the list as it scrolls: a row
    // behind it is out of sight, and is brought out under it.
    it("keeps the card on a phone, and counts a row behind it as away", async () => {
      await page.viewport(390, 844)
      try {
        plan.today.set(days[2])
        fixture.detectChanges()
        const host = fixture.nativeElement as HTMLElement
        const column = host.querySelector(".today-column") as HTMLElement
        expect(getComputedStyle(column).position).toBe("sticky")
        // The title and the progress go up with the page.
        expect(column.querySelector(".intro, .progress")).toBeNull()
        window.scrollTo(0, document.documentElement.scrollHeight)
        await vi.waitFor(() => {
          fixture.detectChanges()
          expect(pill()?.textContent).toContain("arrow_upward")
        })
        // Scrolled just so the row is under the card: still away.
        const row = host.querySelector("[data-next]") as HTMLElement
        const card = column.getBoundingClientRect()
        window.scrollBy(0, row.getBoundingClientRect().top - card.top - 4)
        await vi.waitFor(() => {
          fixture.detectChanges()
          expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            column.getBoundingClientRect().bottom,
          )
          expect(pill()?.textContent).toContain("arrow_upward")
        })
      } finally {
        await page.viewport(800, 600)
      }
    })

    // On two columns the card is beside the list: the web's fixed header is
    // what hides a row, measured as drawn (its height a calc() unread).
    it("counts a row behind the web's header as away", async () => {
      const header = document.createElement("header")
      const bar = document.createElement("div")
      bar.className = "mat-toolbar"
      bar.style.cssText =
        "position: fixed; top: 0; left: 0; right: 0; height: 56px"
      header.append(bar)
      document.body.append(header)
      try {
        plan.today.set(days[2])
        fixture.detectChanges()
        const row = (fixture.nativeElement as HTMLElement).querySelector(
          "[data-next]",
        ) as HTMLElement
        // Its bottom just under the header's.
        window.scrollBy(0, row.getBoundingClientRect().bottom - 40)
        await vi.waitFor(() => {
          fixture.detectChanges()
          const box = row.getBoundingClientRect()
          expect(box.bottom).toBeGreaterThan(0)
          expect(box.bottom).toBeLessThanOrEqual(56)
          expect(pill()?.textContent).toContain("arrow_upward")
        })
      } finally {
        header.remove()
      }
    })

    // The days before it unfolded, at the top of them.
    // Unfolded with the page at its top: no scroll follows, and the row
    // moved under the fold all the same (it passed on a stray scroll event).
    it("points down to a next day below", async () => {
      window.scrollTo(0, 0)
      plan.today.set(days[79])
      fixture.detectChanges()
      await fixture.whenStable()
      button("dias anteriores")?.click()
      // The reader has scrolled, else the pill waits.
      window.scrollBy(0, 1)
      fixture.detectChanges()
      // A slower runner: a frame's check may take a while to land.
      await vi.waitFor(
        () => {
          fixture.detectChanges()
          expect(pill()?.textContent).toContain("arrow_downward")
        },
        { timeout: 3000 },
      )
    })
  })

  // A wide screen's card, half the page: the third wrapped onto a row alone.
  it("fits the day's buttons in one row on a wide screen", async () => {
    await page.viewport(1400, 900)
    try {
      plan.done.set([1])
      button("No princípio")?.click()
      fixture.detectChanges()
      const rows = () =>
        new Set(
          Array.from(
            (fixture.nativeElement as HTMLElement).querySelectorAll(
              ".today .actions > *",
            ),
            (button) => Math.round(button.getBoundingClientRect().top),
          ),
        ).size
      expect(button("Marcar como não lido")).toBeDefined()
      // The day's card leads: on the left, the days beside it.
      const box = (selector: string) =>
        (
          (fixture.nativeElement as HTMLElement).querySelector(
            selector,
          ) as HTMLElement
        ).getBoundingClientRect()
      expect(box(".today-column").right).toBeLessThanOrEqual(
        box(".days-column").left,
      )
      expect(rows()).toBe(1)
    } finally {
      await page.viewport(800, 600)
    }
  })

  describe("the list on a long plan", () => {
    const days = Array.from({ length: 80 }, (_, i) => ({
      ...day1,
      day: i + 1,
      title: `Dia ${i + 1}`,
    }))
    const host = () => fixture.nativeElement as HTMLElement
    const pill = () => host().querySelector<HTMLElement>(".to-next")
    const rowTop = (day: number) =>
      host().querySelector(`li[data-day="${day}"]`)?.getBoundingClientRect()
        .top as number

    beforeEach(() => {
      plan.days.set([intro, ...days])
      plan.today.set(days[60])
      // The card on today's day, as at the first paint (a day ended keeps
      // its card: today's is the one left).
      plan.active.set(days[60])
      fixture.detectChanges()
      plan.active.set(null)
      fixture.detectChanges()
    })

    afterEach(() => window.scrollTo(0, 0))

    it("opens the days before in place, and folds them again with focus kept", async () => {
      const fold = host().querySelector<HTMLButtonElement>(".earlier")
      expect(fold?.textContent).toContain("Mostrar os 59 dias anteriores")
      const first = host()
        .querySelector(".day")
        ?.closest("li")
        ?.getAttribute("data-day") as string
      const before = rowTop(Number(first))
      fold?.focus()
      fold?.click()
      fixture.detectChanges()
      await vi.waitFor(() => {
        fixture.detectChanges()
        expect(Math.abs(rowTop(Number(first)) - before)).toBeLessThan(1)
      })
      expect(host().querySelectorAll(".day").length).toBe(81)
      expect(fold?.textContent).toContain("Ocultar os dias anteriores")
      expect(fold?.getAttribute("aria-expanded")).toBe("true")
      expect(document.activeElement).toBe(fold)

      fold?.click()
      fixture.detectChanges()
      expect(host().querySelectorAll(".day").length).toBe(22)
      expect(host().querySelector(".earlier")).toBe(fold)
      expect(document.activeElement).toBe(fold)
      expect(fold?.textContent).toContain("Mostrar os 59 dias anteriores")
    })

    // A bar over the whole window hides the next row, the page untouched.
    describe("the pill on a fresh page", () => {
      let header: HTMLElement
      beforeEach(() => {
        header = document.createElement("header")
        const bar = document.createElement("div")
        bar.className = "mat-toolbar"
        bar.style.cssText =
          "position: fixed; top: 0; left: 0; right: 0; height: 5000px"
        header.append(bar)
        document.body.append(header)
      })
      afterEach(() => header.remove())

      it("waits while the card shows the next day, until a day is picked", async () => {
        window.dispatchEvent(new Event("resize"))
        await new Promise((resolve) => setTimeout(resolve, 100))
        fixture.detectChanges()
        expect(pill()).toBeNull()
        button("Dia 63")?.click()
        fixture.detectChanges()
        await vi.waitFor(() => {
          fixture.detectChanges()
          window.dispatchEvent(new Event("resize"))
          expect(pill()).not.toBeNull()
        })
      })

      it("waits until the list is scrolled", async () => {
        window.dispatchEvent(new Event("resize"))
        await new Promise((resolve) => setTimeout(resolve, 100))
        fixture.detectChanges()
        expect(pill()).toBeNull()
        window.scrollTo(0, 40)
        await vi.waitFor(() => {
          fixture.detectChanges()
          expect(pill()).not.toBeNull()
        })
      })
    })

    const away = async () => {
      plan.today.set(days[2])
      fixture.detectChanges()
      window.scrollTo(0, document.documentElement.scrollHeight)
      await vi.waitFor(() => {
        fixture.detectChanges()
        expect(pill()).not.toBeNull()
      })
    }

    it("is centred over the days on a wide screen", async () => {
      await page.viewport(1400, 900)
      try {
        await away()
        const column = host().querySelector(".days-column") as HTMLElement
        const box = column.getBoundingClientRect()
        const at = (pill() as HTMLElement).getBoundingClientRect()
        expect(
          Math.abs(at.left + at.width / 2 - (box.left + box.width / 2)),
        ).toBeLessThan(2)
        expect(at.bottom).toBeLessThanOrEqual(window.innerHeight)
      } finally {
        await page.viewport(800, 600)
      }
    })

    it("docks at the right edge on a phone", async () => {
      await page.viewport(390, 844)
      try {
        await away()
        const box = (pill() as HTMLElement).getBoundingClientRect()
        expect(
          Math.abs(document.documentElement.clientWidth - box.right - 16),
        ).toBeLessThan(1)
      } finally {
        await page.viewport(800, 600)
      }
    })

    it("sets the page's scroll-padding to the card's foot on a phone", async () => {
      await page.viewport(390, 844)
      try {
        const root = document.documentElement
        const column = host().querySelector(".today-column") as HTMLElement
        const padding = () =>
          Number.parseFloat(getComputedStyle(root).scrollPaddingTop)
        // Where the card sticks (under the bars), and its height.
        const foot = () =>
          Number.parseFloat(getComputedStyle(column).top) + column.offsetHeight
        await vi.waitFor(() => expect(padding()).toBe(foot()))
        expect(padding()).toBeGreaterThan(100)
        // Another card, another height: followed.
        plan.active.set(day1)
        plan.stage.set("reflection")
        fixture.detectChanges()
        await vi.waitFor(() => expect(padding()).toBe(foot()))
        fixture.destroy()
        expect(root.style.scrollPaddingTop).toBe("")
      } finally {
        await page.viewport(800, 600)
      }
    })

    it("leaves the scroll-padding alone beside the card on a wide screen", async () => {
      await page.viewport(1400, 900)
      try {
        await vi.waitFor(() =>
          expect(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          ).toBe("0px"),
        )
      } finally {
        await page.viewport(800, 600)
      }
    })
  })

  describe("the reflection's controls", () => {
    // Centres, not tops: the play button is taller than the rest.
    const rows = () =>
      new Set(
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll(
            ".transport button",
          ),
          (b) => {
            const box = b.getBoundingClientRect()
            return Math.round(box.top + box.height / 2)
          },
        ),
      )

    it.each([320, 390])("fit one row on a phone %ipx wide", async (width) => {
      await page.viewport(width, 844)
      try {
        plan.active.set(day1)
        plan.stage.set("reflection")
        plan.previous.set(day1.readings[2])
        fixture.detectChanges()
        const host = fixture.nativeElement as HTMLElement
        expect(host.querySelectorAll(".transport button").length).toBe(6)
        expect(rows().size).toBe(1)
        // Play in the middle, as the reader's card: ⏭ there though off.
        const centre = (selector: string) => {
          const box = (
            host.querySelector(selector) as HTMLElement
          ).getBoundingClientRect()
          return box.left + box.width / 2
        }
        expect(
          Math.abs(centre(".transport .play") - centre(".transport")),
        ).toBeLessThan(1)
        expect(
          (host.querySelector(".skip-intro") as HTMLButtonElement).disabled,
        ).toBe(true)
        // «Terminar» is in the kicker's line, named for screen readers.
        const finish = host.querySelector(".kicker button") as HTMLElement
        expect(finish.getAttribute("aria-label")).toBe("Terminar")
        expect(host.querySelector(".transport .finish")).toBeNull()
        const scrolls = host.scrollWidth
        expect(scrolls).toBeLessThanOrEqual(host.clientWidth)
      } finally {
        plan.previous.set(null)
        await page.viewport(800, 600)
      }
    })
  })

  describe("one or two columns", () => {
    const layout = () => {
      const host = fixture.nativeElement as HTMLElement
      return {
        grid: getComputedStyle(host.querySelector(".mais365") as Element)
          .display,
        sticky:
          getComputedStyle(host.querySelector(".today-column") as Element)
            .position === "sticky",
      }
    }

    it("puts a phone on its side in one column, the card over the list", async () => {
      await page.viewport(844, 390)
      try {
        expect(layout()).toEqual({ grid: "block", sticky: true })
      } finally {
        await page.viewport(800, 600)
      }
    })

    it("keeps two columns where there is room both ways", async () => {
      await page.viewport(820, 1180)
      try {
        expect(layout()).toEqual({ grid: "grid", sticky: false })
      } finally {
        await page.viewport(800, 600)
      }
    })
  })

  // Hosted on the web, the page sits in the reader's text and takes its size.
  it("takes the size of the text around it", () => {
    const host = fixture.nativeElement as HTMLElement
    host.style.fontSize = "20px"
    const page = host.querySelector(".mais365") as HTMLElement
    expect(getComputedStyle(page).fontSize).toBe("20px")
  })

  describe("the day's card", () => {
    const host = () => fixture.nativeElement as HTMLElement
    const many: PlanDay = {
      ...day1,
      day: 175,
      title: "Muitas leituras",
      readings: Array.from({ length: 7 }, (_, i) =>
        reading("gen", "Génesis", i + 1),
      ),
    }
    const day2: PlanDay = { ...day1, day: 2, title: "Dia 2" }
    const pick = (title: string) => {
      button(title)?.click()
      fixture.detectChanges()
    }
    const visibleRows = () =>
      Array.from(
        host().querySelectorAll<HTMLElement>(".readings > li:not(.more-row)"),
      ).filter((li) => li.offsetParent !== null).length
    const mark = () => host().querySelector<HTMLElement>(".mark") as HTMLElement

    it("shows three readings on a phone, the rest behind «+ N leituras»", async () => {
      plan.days.set([intro, day1, many])
      fixture.detectChanges()
      await page.viewport(375, 667)
      try {
        pick("Muitas leituras")
        const more = host().querySelector<HTMLButtonElement>(
          ".more-row button",
        ) as HTMLElement
        expect(visibleRows()).toBe(3)
        expect(more.textContent).toContain("+ 4 leituras")
        expect(more.getAttribute("aria-expanded")).toBe("false")
        more.click()
        fixture.detectChanges()
        expect(visibleRows()).toBe(7)
        expect(more.textContent).toContain("Menos leituras")
        expect(more.getAttribute("aria-expanded")).toBe("true")
        more.click()
        fixture.detectChanges()
        expect(visibleRows()).toBe(3)
      } finally {
        await page.viewport(800, 600)
      }
    })

    it("has no «+ N leituras» row for three readings, and all rows on a wide screen", async () => {
      pick("No princípio")
      expect(host().querySelector(".more-row")).toBeNull()
      plan.days.set([intro, day1, many])
      fixture.detectChanges()
      await page.viewport(1400, 900)
      try {
        pick("Muitas leituras")
        expect(visibleRows()).toBe(7)
        expect(
          host().querySelector(".more-row")?.getBoundingClientRect().height,
        ).toBe(0)
      } finally {
        await page.viewport(800, 600)
      }
    })

    it("tells read from unread by two glyphs, on the card and in the list", () => {
      pick("No princípio")
      expect(mark().textContent).toContain("radio_button_unchecked")
      expect(mark().getAttribute("aria-pressed")).toBe("false")
      plan.done.set([1])
      fixture.detectChanges()
      expect(mark().textContent).toContain("check_circle")
      expect(mark().getAttribute("aria-pressed")).toBe("true")
      expect(
        button("No princípio")?.querySelector(".day-mark.filled")?.textContent,
      ).toContain("check_circle")
    })

    // «Lido» read as a state, the day done already: it says what to do.
    // «Lido» read as done already, «Marcar como lido» didn't fit a small
    // phone: an empty circle, filled once read, said in words to readers.
    it("shows the mark as an icon alone, named for screen readers", () => {
      expect(mark().textContent?.trim()).toBe("radio_button_unchecked")
      expect(mark().getAttribute("aria-label")).toBe("Marcar como lido")
      pick("No princípio")
    })

    it("offers the next unread day once this one is read, «Ouvir e ler» beside it", () => {
      plan.days.set([intro, day1, day2])
      plan.done.set([0, 1])
      plan.today.set(day2)
      fixture.detectChanges()
      pick("No princípio")
      const main = host().querySelector(".actions .main") as HTMLElement
      expect(main.textContent).toContain("Dia 2")
      button("Ouvir e ler")?.click()
      expect(plan.start).toHaveBeenCalledWith(day1, 0, "plan", true)
      main.click()
      fixture.detectChanges()
      expect(host().querySelector("#day-title")?.textContent).toBe("Dia 2")
      // Nothing later to read: listening is the main step again.
      plan.done.set([0, 1, 2])
      pick("No princípio")
      expect(
        (host().querySelector(".actions .main") as HTMLElement).textContent,
      ).toContain("Ouvir e ler")
    })

    it("says «A seguir» instead of «Hoje» once a day is read today", () => {
      expect(host().querySelector(".kicker")?.textContent).toContain("Hoje")
      plan.lastReadOn.set(localDay(new Date()))
      fixture.detectChanges()
      expect(host().querySelector(".kicker")?.textContent).toContain("A seguir")
      expect(host().querySelector(".kicker")?.textContent).not.toContain("Hoje")
      plan.lastReadOn.set("2020-01-01")
      fixture.detectChanges()
      expect(host().querySelector(".kicker")?.textContent).toContain("Hoje")
    })

    // Left open past midnight: yesterday's reading isn't today's.
    it("follows the clock past midnight: «Hoje» again, the flame out", () => {
      plan.streak.set(3)
      plan.lastReadOn.set("2026-11-26")
      plan.clockDay.set("2026-11-26")
      fixture.detectChanges()
      expect(host().querySelector(".kicker")?.textContent).toContain("A seguir")
      expect(host().querySelector(".kicker .chip .lit")).not.toBeNull()
      plan.clockDay.set("2026-11-27")
      fixture.detectChanges()
      expect(host().querySelector(".kicker")?.textContent).toContain("Hoje")
      expect(host().querySelector(".kicker .chip .lit")).toBeNull()
    })

    it("shows the streak on the card from two, lit once today is read", () => {
      const chip = () => host().querySelector(".kicker .chip")
      plan.streak.set(1)
      fixture.detectChanges()
      expect(chip()).toBeNull()
      plan.streak.set(3)
      fixture.detectChanges()
      expect(chip()?.textContent).toContain("3")
      expect(chip()?.querySelector(".lit")).toBeNull()
      plan.lastReadOn.set(localDay(new Date()))
      fixture.detectChanges()
      expect(chip()?.querySelector(".lit")).not.toBeNull()
    })

    it("announces a day picked from the list, not the card as it loads", () => {
      const live = host().querySelector(
        ".today-column [aria-live]",
      ) as HTMLElement
      expect(live.getAttribute("aria-live")).toBe("polite")
      expect(live.textContent).toBe("")
      pick("No princípio")
      expect(live.textContent).toBe("Dia 1: No princípio")
    })
  })
})
