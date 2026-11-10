import type { Mock } from "vitest"
import { StudyColumns } from "./study-columns"

const press = (key: string) =>
  new KeyboardEvent("keydown", { key, cancelable: true })

describe("StudyColumns", () => {
  let folded: { rail: boolean; panel: boolean }
  let save: Mock
  let repaint: Mock
  let container: HTMLElement
  let columns: StudyColumns

  beforeEach(() => {
    folded = { rail: false, panel: false }
    save = vi.fn()
    repaint = vi.fn()
    container = document.createElement("div")
    columns = new StudyColumns({
      container: () => container,
      column: () => undefined,
      folded: () => folded,
      save,
      repaint,
    })
  })

  it("writes the widths as the properties the layout reads", () => {
    columns.widths = { rail: 300, panel: 420, split: 60 }

    expect(columns.style).toEqual({
      "--study-rail-width": "300px",
      "--study-panel-width": "420px",
      "--study-split": "60%",
    })
  })

  it("leaves untouched dividers to the layout's own widths", () => {
    columns.widths = { rail: 300 }

    expect(columns.style).toEqual({ "--study-rail-width": "300px" })
  })

  it("gives the space back when the column is folded away", () => {
    columns.widths = { rail: 400, panel: 500 }
    folded.rail = true

    // The width is the reader's, and it is kept for when they unfold it —
    // but a folded column is a strip, and an inline width would hold the
    // space open against the layout.
    expect(columns.style["--study-rail-width"]).toBeUndefined()
    expect(columns.style["--study-panel-width"]).toBe("500px")

    folded.rail = false
    expect(columns.style["--study-rail-width"]).toBe("400px")
  })

  it("moves a divider with the arrow keys, and remembers where", () => {
    columns.widths = { rail: 300 }

    columns.key("rail", press("ArrowRight"))

    expect(columns.widths.rail).toBe(316)
    expect(save).toHaveBeenCalledWith({ rail: 316 })
    expect(container.style.getPropertyValue("--study-rail-width")).toBe("316px")
  })

  it("moves the panel's divider the way the pointer does, not the other way", () => {
    // The panel is on the right: its edge goes left as it grows, so
    // ArrowLeft widens it, as a drag to the left does.
    columns.widths = { panel: 400 }

    columns.key("panel", press("ArrowLeft"))
    expect(columns.widths.panel).toBe(416)

    columns.key("panel", press("ArrowRight"))
    columns.key("panel", press("ArrowRight"))
    expect(columns.widths.panel).toBe(384)
  })

  it("keeps a column within what it can usefully be", () => {
    columns.widths = { rail: 170 }

    columns.key("rail", press("ArrowLeft"))

    expect(columns.widths.rail).toBe(160)
  })

  it("ignores keys that are not a divider's", () => {
    columns.widths = { rail: 300 }

    columns.key("rail", press("ArrowUp"))

    expect(columns.widths.rail).toBe(300)
    expect(save).not.toHaveBeenCalled()
  })

  it("hands one divider back to the layout without disturbing the others", () => {
    columns.widths = { rail: 300, panel: 420 }

    columns.reset("rail")

    expect(columns.widths.rail).toBeUndefined()
    expect(columns.widths.panel).toBe(420)
    expect(save).toHaveBeenCalledWith({ panel: 420 })
  })

  it("hands a divider back on Home, and takes the key", () => {
    columns.widths = { rail: 300 }
    const event = press("Home")

    columns.key("rail", event)

    expect(columns.widths.rail).toBeUndefined()
    expect(event.defaultPrevented).toBe(true)
  })

  describe("a pointer on a divider", () => {
    const pointer = (type: string, x: number) =>
      new PointerEvent(type, { pointerId: 1, clientX: x })
    const down = (x: number) => {
      const target = document.createElement("div")
      target.setPointerCapture = vi.fn()
      const event = pointer("pointerdown", x)
      Object.defineProperty(event, "target", { value: target })
      columns.start("rail", event)
    }

    it("pins nothing when it is only a click", () => {
      down(100)
      columns.end(pointer("pointerup", 100))

      // The width it happened to measure must not replace the layout's own.
      expect(columns.widths.rail).toBeUndefined()
      expect(save).not.toHaveBeenCalled()
      expect(container.style.getPropertyValue("--study-rail-width")).toBe("")
    })

    it("keeps where a drag ended", () => {
      columns.widths = { rail: 300 }
      down(100)
      columns.move(pointer("pointermove", 140))
      columns.end(pointer("pointerup", 140))

      expect(columns.widths.rail).toBe(340)
      expect(save).toHaveBeenCalledWith({ rail: 340 })
    })

    it("keeps what was painted when the pointer is cancelled, not the 0 it reports", () => {
      columns.widths = { rail: 300 }
      down(100)
      columns.move(pointer("pointermove", 140))
      // A cancel has no position: Chromium gives clientX 0.
      columns.end(pointer("pointercancel", 0))

      expect(columns.widths.rail).toBe(340)
      expect(save).toHaveBeenCalledWith({ rail: 340 })
    })

    it("pins nothing when a click is cancelled", () => {
      down(100)
      columns.end(pointer("pointercancel", 0))

      expect(columns.widths.rail).toBeUndefined()
      expect(save).not.toHaveBeenCalled()
    })
  })

  it("does nothing to a layout that is not there yet", () => {
    const early = new StudyColumns({
      container: () => undefined,
      column: () => undefined,
      folded: () => folded,
      save,
      repaint,
    })
    early.widths = { rail: 300 }

    expect(() => early.key("rail", press("ArrowRight"))).not.toThrow()
    expect(early.widths.rail).toBe(316)
  })
})
