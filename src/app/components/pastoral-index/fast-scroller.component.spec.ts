import { Component, signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { HapticsService } from "../../services/haptics.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { FastScrollerComponent } from "./fast-scroller.component"

@Component({
  imports: [FastScrollerComponent],
  // The host's place, which the page sets through its custom properties.
  template: `
    <div style="height: 5000px">
      <fast-scroller style="top: 100px; bottom: 100px" [letter]="letter()" />
    </div>
  `,
})
class Host {
  readonly letter = signal<string | null>("A")
}

describe("FastScrollerComponent", () => {
  let fixture: ComponentFixture<Host>
  let haptics: SpyObj<HapticsService>
  let thumb: HTMLElement

  async function render() {
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()
  }

  const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

  async function scrollTo(top: number) {
    window.scrollTo({ top, behavior: "instant" })
    await nextFrame()
    await nextFrame()
    await render()
  }

  const pointer = (type: string, clientY: number) =>
    new PointerEvent(type, { clientY, pointerId: 1, bubbles: true })

  beforeEach(async () => {
    haptics = createSpyObj("HapticsService", ["selection"])
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: HapticsService, useValue: haptics }],
    })
    fixture = TestBed.createComponent(Host)
    fixture.detectChanges()
    await fixture.whenStable()
    thumb = fixture.nativeElement.querySelector(".thumb")
    vi.spyOn(thumb, "setPointerCapture").mockImplementation(() => {})
  })

  afterEach(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
  })

  it("stays out of the way until the page moves", async () => {
    expect(thumb.classList).not.toContain("shown")
    await scrollTo(400)
    expect(thumb.classList).toContain("shown")
  })

  it("follows the page down its track", async () => {
    const range = document.documentElement.scrollHeight - window.innerHeight
    await scrollTo(range)
    const track = thumb.parentElement?.getBoundingClientRect() as DOMRect
    expect(thumb.getBoundingClientRect().bottom).toBeCloseTo(track.bottom, 0)
  })

  it("fades once the page has stopped, but not while held", async () => {
    await scrollTo(400)
    vi.useFakeTimers()
    thumb.dispatchEvent(pointer("pointerdown", 150))
    await vi.advanceTimersByTimeAsync(5000)
    expect(fixture.componentInstance).toBeTruthy()
    thumb.dispatchEvent(pointer("pointerup", 150))
    await vi.advanceTimersByTimeAsync(1600)
    vi.useRealTimers()
    await render()
    expect(thumb.classList).not.toContain("shown")
  })

  it("scrolls the page as the thumb is dragged", async () => {
    await scrollTo(100)
    const { top, height } = thumb.getBoundingClientRect()
    const start = top + height / 2
    thumb.dispatchEvent(pointer("pointerdown", start))
    thumb.dispatchEvent(pointer("pointermove", start + 150))
    expect(window.scrollY).toBeGreaterThan(500)
  })

  it("ignores a move that didn't start on the thumb", async () => {
    await scrollTo(100)
    thumb.dispatchEvent(pointer("pointermove", 400))
    expect(window.scrollY).toBe(100)
  })

  it("shows the letter reached in a bubble, only while held", async () => {
    await scrollTo(100)
    expect(thumb.querySelector(".bubble")).toBeNull()
    thumb.dispatchEvent(pointer("pointerdown", 150))
    await render()
    expect(thumb.querySelector(".bubble")?.textContent).toBe("A")
    thumb.dispatchEvent(pointer("pointerup", 150))
    await render()
    expect(thumb.querySelector(".bubble")).toBeNull()
  })

  it("ticks for each letter a drag goes through, not for a plain scroll", async () => {
    fixture.componentInstance.letter.set("B")
    await render()
    expect(haptics.selection).not.toHaveBeenCalled()
    thumb.dispatchEvent(pointer("pointerdown", 150))
    await render()
    fixture.componentInstance.letter.set("C")
    await render()
    expect(haptics.selection).toHaveBeenCalledTimes(1)
  })

  it("is hidden from screen readers, which have the letter buttons", () => {
    expect(thumb.parentElement?.getAttribute("aria-hidden")).toBe("true")
  })
})
