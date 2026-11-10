import type { StudyColumnWidths } from "../../services/preferences.service"

/**
 * What a reader may drag study mode's columns to.
 *
 * The limits are the same ones the stylesheet clamps to by default: below the
 * minimum a column stops being able to show what it is for, and above the
 * maximum it starts taking the text's room rather than sharing it. The split
 * is the share of the reading column the chapter keeps when a passage is open
 * beside it.
 */
export const COLUMN_LIMITS = {
  rail: { min: 160, max: 420 },
  panel: { min: 240, max: 560 },
  split: { min: 25, max: 75 },
} as const

/**
 * The most of the window a side column may take, whatever width was kept.
 * Study mode opens from 1024px, where the two columns at their pixel limits
 * would leave the text 44px: the pixels are what the reader chose, the share
 * is what the window can spare, and the smaller wins as the window changes.
 */
const WINDOW_SHARE = { rail: 28, panel: 38 } as const

/** A side column's width as the layout reads it: the pixels, held to the window's share. */
const columnWidth = (divider: "rail" | "panel", px: number): string =>
  `min(${px}px, ${WINDOW_SHARE[divider]}vw)`

/** How far one arrow-key press moves a divider. */
const RESIZE_STEP = 16

/** Which divider a drag or a key press is moving. */
export type StudyDivider = keyof typeof COLUMN_LIMITS

/** What the columns need from the reader that owns them. */
export type StudyColumnsHost = {
  /** Carries the widths the reader has dragged the columns to. */
  container: () => HTMLElement | undefined
  /** The reading column, which the split divider divides. */
  column: () => HTMLElement | undefined
  /** Which side columns are folded away. */
  folded: () => { rail: boolean; panel: boolean }
  /** Where the widths are kept. */
  save: (widths: StudyColumnWidths) => void
  /** Paints what changed: the reader's template is not told otherwise. */
  repaint: () => void
}

/**
 * The widths of study mode's columns, and the dividers that move them: a
 * drag, the arrow keys, and a double click or Home to hand one back to the
 * layout. Kept out of the reader, which has more than enough to do, and
 * which none of this needs more than three elements and a place to save to.
 */
export class StudyColumns {
  /** Where the reader has dragged the dividers, if anywhere. */
  widths: StudyColumnWidths = {}
  /**
   * Where each divider stands, for the separators to announce. Measured when
   * one takes focus rather than on every pass: a divider left alone still has
   * a width, and reading it off the layout costs a reflow that change
   * detection runs often enough to feel.
   */
  values: Record<StudyDivider, number> = { rail: 0, panel: 0, split: 50 }
  /** What a divider may be moved between, for the same announcement. */
  readonly limits = COLUMN_LIMITS
  /** Set while a divider is under the pointer, to keep the drag cursor. */
  resizing: StudyDivider | null = null
  private dragFrom?: {
    pointerId: number
    x: number
    value: number
    /**
     * What the last move painted; unset until the pointer has moved. A cancel
     * carries no position of its own, so this is what it has to commit.
     */
    painted?: number
  }

  constructor(private readonly host: StudyColumnsHost) {}

  /**
   * The widths the reader has set, as custom properties on the layout. The
   * stylesheet's clamped defaults apply to whatever is not here, so a divider
   * never touched keeps behaving as the layout wants it to.
   */
  get style(): Record<string, string> {
    const style: Record<string, string> = {}
    const { rail, panel, split } = this.widths
    // A folded column has no width of the reader's to honour: it is a strip
    // with an unfold button on it. Left here, the width dragged earlier is an
    // inline style, and it would beat the stylesheet and hold the space open.
    if (rail !== undefined && !this.host.folded().rail) {
      style["--study-rail-width"] = columnWidth("rail", rail)
    }
    if (panel !== undefined && !this.host.folded().panel) {
      style["--study-panel-width"] = columnWidth("panel", panel)
    }
    if (split !== undefined) style["--study-split"] = `${split}%`
    return style
  }

  /** Reads every divider off the layout, so each can announce where it is. */
  announce(): void {
    this.values = {
      rail: Math.round(this.value("rail")),
      panel: Math.round(this.value("panel")),
      split: Math.round(this.value("split")),
    }
    this.host.repaint()
  }

  /** Where a divider currently stands, whether the reader put it there or not. */
  private value(divider: StudyDivider): number {
    const stored = this.widths[divider]
    if (stored !== undefined) return stored
    const measure = (element: Element | undefined | null): number =>
      element ? element.getBoundingClientRect().width : 0
    const host = this.host.container()
    if (divider === "rail") return measure(host?.querySelector(".study-rail"))
    if (divider === "panel") return measure(host?.querySelector(".study-aside"))
    const column = measure(this.host.column())
    const pane = measure(this.host.column()?.firstElementChild)
    return column > 0 ? (pane / column) * 100 : 50
  }

  /**
   * Follows the pointer while a divider is dragged.
   *
   * The property is written straight to the element rather than through a
   * binding: a drag emits a move event per frame, and running change detection
   * over the whole reader on each one is what makes a resize feel heavy. The
   * value is committed to the component and to the reader's preferences when
   * the pointer is let go.
   */
  start(divider: StudyDivider, event: PointerEvent): void {
    event.preventDefault()
    this.resizing = divider
    this.dragFrom = {
      pointerId: event.pointerId,
      x: event.clientX,
      value: this.value(divider),
    }
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    this.host.repaint()
  }

  move(event: PointerEvent): void {
    const from = this.dragFrom
    if (!from || from.pointerId !== event.pointerId || !this.resizing) return
    from.painted = this.nextValue(
      this.resizing,
      event.clientX - from.x,
      from.value,
    )
    this.paint(this.resizing, from.painted)
  }

  end(event: PointerEvent): void {
    const from = this.dragFrom
    if (!from || !this.resizing) return
    const divider = this.resizing
    // A click is not a drag: committing it would write the width it happened
    // to measure over the layout's responsive default, and keep it there
    // across window sizes and reloads.
    if (from.painted !== undefined) {
      // A cancelled pointer reports no coordinates (Chromium gives 0), which
      // would throw the divider to its limit: keep what the reader saw.
      this.commit(
        divider,
        event.type === "pointercancel"
          ? from.painted
          : this.nextValue(divider, event.clientX - from.x, from.value),
      )
    }
    this.dragFrom = undefined
    this.resizing = null
    this.host.repaint()
  }

  /**
   * The keyboard half of a divider: it is a separator the reader can focus,
   * and arrows move it. Home puts it back where the layout wanted it.
   */
  key(divider: StudyDivider, event: KeyboardEvent): void {
    if (event.key === "Home") {
      this.reset(divider)
      event.preventDefault()
      return
    }
    const step =
      event.key === "ArrowLeft"
        ? -RESIZE_STEP
        : event.key === "ArrowRight"
          ? RESIZE_STEP
          : 0
    if (!step) return
    event.preventDefault()
    // The move a drag of that many pixels makes, so the keys and the pointer
    // agree on which way each divider goes: the panel's grows to the left.
    this.commit(divider, this.nextValue(divider, step, this.value(divider)))
  }

  /** Hands a divider back to the layout's own clamped width. */
  reset(divider: StudyDivider): void {
    const { [divider]: _dropped, ...rest } = this.widths
    this.widths = rest
    this.host
      .container()
      ?.style.removeProperty(
        divider === "split" ? "--study-split" : `--study-${divider}-width`,
      )
    this.host.column()?.style.removeProperty("--study-split")
    this.host.save(this.widths)
    this.host.repaint()
  }

  /** Where a drag has moved a divider to. */
  private nextValue(
    divider: StudyDivider,
    deltaX: number,
    from: number,
  ): number {
    // The panel grows as the pointer moves left, the others as it moves right.
    const towards = divider === "panel" ? -deltaX : deltaX
    const column = this.host.column()?.getBoundingClientRect().width
    const delta =
      divider === "split" && column ? (towards / column) * 100 : towards
    return from + delta
  }

  /** What the column can usefully be, whichever way it was asked to move. */
  private clamp(divider: StudyDivider, value: number): number {
    const limits = this.limits[divider]
    return Math.min(limits.max, Math.max(limits.min, value))
  }

  private paint(divider: StudyDivider, raw: number): void {
    const value = this.clamp(divider, raw)
    if (divider === "split") {
      this.host.column()?.style.setProperty("--study-split", `${value}%`)
      return
    }
    this.host
      .container()
      ?.style.setProperty(
        `--study-${divider}-width`,
        columnWidth(divider, value),
      )
  }

  private commit(divider: StudyDivider, value: number): void {
    // Clamped here rather than at each caller: the pointer and the arrow keys
    // both end up in this one place, and a column may only be so wide.
    const rounded = Math.round(this.clamp(divider, value) * 10) / 10
    this.widths = { ...this.widths, [divider]: rounded }
    this.values = {
      ...this.values,
      [divider]: Math.round(rounded),
    }
    this.paint(divider, rounded)
    this.host.save(this.widths)
    this.host.repaint()
  }
}
