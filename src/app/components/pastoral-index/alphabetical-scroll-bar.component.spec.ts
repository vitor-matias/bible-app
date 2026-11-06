import { Component, signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { AlphabeticalScrollBarComponent } from "./alphabetical-scroll-bar.component"

@Component({
  imports: [AlphabeticalScrollBarComponent],
  template: `
    <alphabetical-scroll-bar
      [style.height.px]="height()"
      style="font-size: 12px"
      [alphabet]="alphabet()"
      [current]="current()"
      (letterChange)="chosen.push($event)"
      (isActive)="activity.push($event)"
    />
  `,
})
class Host {
  readonly height = signal(700)
  readonly alphabet = signal([..."ABCDEFGHIJKLMNOPRSTUVZ"])
  readonly current = signal<string | null>(null)
  readonly chosen: string[] = []
  readonly activity: boolean[] = []
}

describe("AlphabeticalScrollBarComponent", () => {
  let fixture: ComponentFixture<Host>
  let bar: HTMLElement

  const shown = () =>
    [...bar.querySelectorAll(".letter")].map((l) => l.textContent?.trim())

  async function render() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()
  }

  /** A finger at a letter's height. */
  function touch(type: string, letter: string) {
    const element = [...bar.querySelectorAll(".letter")].find(
      (l) => l.textContent?.trim() === letter,
    ) as HTMLElement
    const { top, height } = element.getBoundingClientRect()
    const event = new Event(type, { bubbles: true })
    Object.assign(event, {
      touches: [{ clientX: 0, clientY: top + height / 2 }],
    })
    bar.dispatchEvent(event)
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host)
    bar = fixture.nativeElement.querySelector("alphabetical-scroll-bar")
    await render()
  })

  it("shows every letter when they fit", () => {
    expect(shown().join("")).toBe("ABCDEFGHIJKLMNOPRSTUVZ")
  })

  it("swaps letters for dividers when they don't fit, and still reaches them", async () => {
    fixture.componentInstance.height.set(200)
    await render()

    expect(shown()).toContain("·")
    expect(shown().length).toBeLessThan(22)
    bar.dispatchEvent(
      Object.assign(new Event("touchstart"), {
        touches: [{ clientX: 0, clientY: bar.getBoundingClientRect().bottom }],
      }),
    )
    expect(fixture.componentInstance.chosen).toEqual(["Z"])
  })

  it("follows the alphabet it's given", async () => {
    fixture.componentInstance.alphabet.set(["F", "P"])
    await render()

    expect(shown()).toEqual(["F", "P"])
  })

  it("highlights the current letter alone", async () => {
    fixture.componentInstance.current.set("M")
    await render()

    const current = bar.querySelectorAll(".letter.current")
    expect(current.length).toBe(1)
    expect(current[0].textContent?.trim()).toBe("M")
  })

  it("highlights the dot standing in for a hidden current letter", async () => {
    fixture.componentInstance.height.set(200)
    fixture.componentInstance.current.set("B")
    await render()

    expect(shown()).not.toContain("B")
    expect(bar.querySelectorAll(".letter.current").length).toBe(1)
    const items = [...bar.querySelectorAll(".letter")]
    const index = items.findIndex((l) => l.classList.contains("current"))
    expect(index).toBeLessThan(items.length / 2)
  })

  it("chooses the letters a finger drags over, once each", () => {
    touch("touchstart", "C")
    touch("touchmove", "C")
    touch("touchmove", "M")

    expect(fixture.componentInstance.chosen).toEqual(["C", "M"])
    expect(fixture.componentInstance.activity).toEqual([true])
  })

  it("magnifies the letters around the finger", async () => {
    touch("touchstart", "M")
    await render()
    const scale = (letter: string) =>
      [...bar.querySelectorAll<HTMLElement>(".letter")].find(
        (l) => l.textContent?.trim() === letter,
      )?.style.transform ?? ""

    expect(scale("M")).toBe("scale(2)")
    expect(scale("L")).toBe("scale(1.7)")
    expect(scale("A")).toBe("scale(1)")

    bar.dispatchEvent(new Event("touchend"))
    await render()
    expect(scale("M")).toBe("")
  })

  it("chooses the same letter again after the finger lifts", () => {
    touch("touchstart", "M")
    bar.dispatchEvent(new Event("touchend"))
    touch("touchstart", "M")

    expect(fixture.componentInstance.chosen).toEqual(["M", "M"])
    expect(fixture.componentInstance.activity).toEqual([true, false, true])
  })

  it("only magnifies under a mouse, until it clicks", () => {
    bar.dispatchEvent(new MouseEvent("mousemove", { clientY: 100 }))
    expect(fixture.componentInstance.chosen).toEqual([])

    bar.dispatchEvent(new MouseEvent("click", { clientY: 100 }))
    expect(fixture.componentInstance.chosen.length).toBe(1)
  })
})
