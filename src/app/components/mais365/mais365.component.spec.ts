import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { page } from "vitest/browser"
import { Mais365Service, type PlanDay } from "../../services/mais365.service"
import { PodcastPlayerService } from "../../services/podcast-player.service"
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
    today: signal(intro),
    active: signal<PlanDay | null>(null),
    stage: signal<number | "reflection" | null>(null),
    previous: signal<PlanDay["readings"][0] | null>(null),
    back: vi.fn(),
    link: (reading: PlanDay["readings"][0]) => [
      "/",
      reading.bookId,
      reading.chapter,
    ],
    query: () => null,
    start: vi.fn(),
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
        el.textContent?.trim().endsWith(label),
    )

  beforeEach(() => {
    plan.days.set([intro, day1])
    plan.today.set(intro)
    plan.done.set([])
    resource.isLoading.set(false)
    resource.error.set(undefined)
    plan.active.set(null)
    plan.stage.set(null)
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Mais365Service, useValue: plan },
        { provide: PodcastPlayerService, useValue: player },
      ],
    })
    fixture = TestBed.createComponent(Mais365Component)
    fixture.detectChanges()
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
    expect(text()).toContain(
      "Com o Padre Miguel Vasconcelos e o Padre Francisco Molho",
    )
    expect(button("Ler sem áudio")).toBeUndefined()
    button("Ouvir")?.click()
    expect(plan.start).toHaveBeenCalledWith(intro)
  })

  it("lists a picked day's readings, to hear and read or read alone", () => {
    button("No princípio")?.click()
    fixture.detectChanges()
    expect(text()).toContain("Génesis 1")
    expect(text()).toContain("Salmo 19")
    expect(button("Ler sem áudio")?.getAttribute("href")).toBe("/gen/1")
    button("Ouvir e ler")?.click()
    expect(plan.start).toHaveBeenCalledWith(day1)
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

      const scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})
      button("Dia 5")?.click()
      pill()?.click()
      fixture.detectChanges()
      expect(scroll).toHaveBeenCalledWith(
        expect.objectContaining({ block: "center" }),
      )
      expect(scroll.mock.contexts[0]).toBe(
        (fixture.nativeElement as HTMLElement).querySelector("[data-next]"),
      )
      // Its card too, in place of the day picked.
      expect(text()).toContain("Dia 3 · Hoje")
    })

    it("points down to a next day below", async () => {
      plan.today.set(days[79])
      fixture.detectChanges()
      await vi.waitFor(() => {
        fixture.detectChanges()
        expect(pill()?.textContent).toContain("arrow_downward")
      })
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
      expect(text()).toContain("Marcar como não lido")
      expect(rows()).toBe(1)
    } finally {
      await page.viewport(800, 600)
    }
  })

  // Hosted on the web, the page sits in the reader's text and takes its size.
  it("takes the size of the text around it", () => {
    const host = fixture.nativeElement as HTMLElement
    host.style.fontSize = "20px"
    const page = host.querySelector(".mais365") as HTMLElement
    expect(getComputedStyle(page).fontSize).toBe("20px")
  })
})
