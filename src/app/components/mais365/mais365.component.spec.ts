import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
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
  const plan = {
    days: [intro, day1],
    done: signal<number[]>([]),
    today: signal(intro),
    active: signal<PlanDay | null>(null),
    stage: signal<number | "reflection" | null>(null),
    previous: signal<PlanDay["readings"][0] | null>(null),
    back: vi.fn(),
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
    stepRate: vi.fn(),
    canSlower: () => true,
    canFaster: () => false,
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
    button("Avançar 10 segundos")?.click()
    expect(player.skip).toHaveBeenCalledWith(10)
    const slider = (fixture.nativeElement as HTMLElement).querySelector(
      "input[matSliderThumb]",
    ) as HTMLInputElement
    expect(slider.min).toBe("688.72")
    expect(slider.max).toBe("1344")
    button("Diminuir velocidade")?.click()
    expect(player.stepRate).toHaveBeenCalledWith(-1)
    expect(button("Aumentar velocidade")?.hasAttribute("disabled")).toBe(true)
    button("Terminar")?.click()
    expect(plan.end).toHaveBeenCalled()
  })
})
