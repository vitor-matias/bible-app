import { type ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MatSnackBar,
  type MatSnackBarRef,
  type TextOnlySnackBar,
} from "@angular/material/snack-bar"
import { Subject } from "rxjs"
import { HighlightService } from "../../services/highlight.service"
import { SelectionActionsComponent } from "./selection-actions.component"

const BOOK = {
  id: "mat",
  name: "Evangelho de São Mateus",
  shortName: "Mateus",
  abrv: "Mt",
  chapterCount: 28,
} as Book

const CHAPTER: Chapter = { bookId: "mat", number: 22, verses: [] }

describe("SelectionActionsComponent", () => {
  let component: SelectionActionsComponent
  let fixture: ComponentFixture<SelectionActionsComponent>
  let highlights: HighlightService
  let host: HTMLElement

  /** A chapter of verses in the DOM, the way the reader renders them. */
  function renderVerses(numbers: number[]): HTMLElement {
    const block = document.createElement("div")
    block.className = "bookBlock"
    for (const number of numbers) {
      const verse = document.createElement("verse")
      verse.id = String(number)
      verse.textContent = `Palavras do versículo ${number}. `
      block.appendChild(verse)
    }
    document.body.appendChild(block)
    return block
  }

  /** Selects across the given verses and lets the component react. */
  function selectVerses(block: HTMLElement, from: number, to: number): void {
    const range = document.createRange()
    range.setStart(block.querySelector(`verse[id="${from}"]`) as Node, 0)
    range.setEnd(
      block.querySelector(`verse[id="${to}"]`) as Node,
      (block.querySelector(`verse[id="${to}"]`) as Node).childNodes.length,
    )
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    component["sync"]()
  }

  beforeEach(async () => {
    localStorage.removeItem("verseHighlights")
    await TestBed.configureTestingModule({
      imports: [SelectionActionsComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(SelectionActionsComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput("book", BOOK)
    fixture.componentRef.setInput("chapter", CHAPTER)
    fixture.detectChanges()
    highlights = TestBed.inject(HighlightService)
    host = renderVerses([37, 38, 39])
  })

  afterEach(() => {
    document.getSelection()?.removeAllRanges()
    host.remove()
    localStorage.removeItem("verseHighlights")
  })

  it("stays out of sight until something is selected", () => {
    component["sync"]()

    expect(component.position).toBeNull()
    expect(fixture.nativeElement.querySelector(".selection-bar")).toBeNull()
  })

  it("appears over a selection, naming the verses it covers", () => {
    selectVerses(host, 37, 38)

    expect(component.position).not.toBeNull()
    expect(component.verses).toEqual([37, 38])
    expect(component.reference).toBe("22,37-38")
  })

  it("names a single verse without a range", () => {
    selectVerses(host, 37, 37)

    expect(component.reference).toBe("22,37")
  })

  it("marks every verse the selection touches", () => {
    selectVerses(host, 37, 39)

    component.mark("green")

    expect(highlights.colorFor("mat", 22, 37)).toBe("green")
    expect(highlights.colorFor("mat", 22, 38)).toBe("green")
    expect(highlights.colorFor("mat", 22, 39)).toBe("green")
  })

  it("sets a run to one colour rather than toggling each verse", () => {
    // Verse 38 is already green; marking the run green must leave it green,
    // not toggle it off while its neighbours turn on.
    highlights.toggle("mat", 22, 38, "green")
    selectVerses(host, 37, 39)

    component.mark("green")

    expect(highlights.colorFor("mat", 22, 38)).toBe("green")
  })

  it("takes the marks off a selected run", () => {
    highlights.toggle("mat", 22, 37, "blue")
    highlights.toggle("mat", 22, 38, "blue")
    selectVerses(host, 37, 38)

    component.clearMarks()

    expect(highlights.colorFor("mat", 22, 37)).toBeUndefined()
    expect(highlights.colorFor("mat", 22, 38)).toBeUndefined()
  })

  it("lets the selection go once it has acted on it", () => {
    selectVerses(host, 37, 38)

    component.mark("pink")

    expect(document.getSelection()?.isCollapsed).toBeTrue()
    expect(component.position).toBeNull()
  })

  describe("in the passage open beside the chapter", () => {
    const JOB = { id: "job", shortName: "Job", abrv: "Jb" } as Book
    let aside: HTMLElement
    let parallel: HTMLElement

    /** The parallel as the reader renders it: its own block, prefixed ids. */
    beforeEach(() => {
      aside = document.createElement("aside")
      aside.className = "study-parallel"
      parallel = renderVerses([37, 38])
      parallel.querySelectorAll("verse").forEach((verse) => {
        verse.id = `parallel-${verse.id}`
      })
      aside.appendChild(parallel)
      document.body.appendChild(aside)
    })

    afterEach(() => aside.remove())

    function selectParallel(): void {
      const range = document.createRange()
      range.selectNodeContents(parallel)
      document.getSelection()?.removeAllRanges()
      document.getSelection()?.addRange(range)
      component["sync"]()
    }

    it("marks the passage, not the same verses of the chapter", () => {
      fixture.componentRef.setInput("parallelBook", JOB)
      fixture.componentRef.setInput("parallelChapter", {
        bookId: "job",
        number: 38,
        verses: [],
      })
      selectParallel()
      expect(component.reference).toBe("38,37-38")

      component.mark("green")

      expect(highlights.colorFor("job", 38, 37)).toBe("green")
      // The numbers are Matthew's too; the selection was not.
      expect(highlights.colorFor("mat", 22, 37)).toBeUndefined()
    })

    it("cites what was copied as the passage it came from", async () => {
      fixture.componentRef.setInput("parallelBook", JOB)
      fixture.componentRef.setInput("parallelChapter", {
        bookId: "job",
        number: 38,
        verses: [],
      })
      const written: string[] = []
      spyOn(navigator.clipboard, "writeText").and.callFake((text: string) => {
        written.push(text)
        return Promise.resolve()
      })
      selectParallel()

      await component.copy()

      expect(written[0]).toContain("(Job 38,37-38)")
    })

    it("stays away until it knows what the passage is", () => {
      // Still loading: nothing to mark the selection against yet.
      selectParallel()

      expect(component.position).toBeNull()
    })
  })

  it("does not count a verse the selection only brushes", () => {
    // The space between two verses belongs to the second: a drag that runs a
    // character past the end of 37 touches 38 without taking a word of it.
    host.innerHTML = ""
    for (const number of [37, 38]) {
      const verse = document.createElement("verse")
      verse.id = String(number)
      verse.innerHTML =
        '<span class="verseText verseRun verseGap"> </span>' +
        `<span class="verseNumber">${number}</span>` +
        `<span class="verseRun">Palavras do ${number}.</span>`
      host.appendChild(verse)
    }
    const next = host.querySelector('verse[id="38"]') as Element
    const range = document.createRange()
    range.setStart(host.querySelector('verse[id="37"]') as Node, 0)
    range.setEnd(next.querySelector(".verseGap")?.firstChild as Node, 1)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    component["sync"]()

    expect(component["verses"]).toEqual([37])
  })

  it("keeps to the chapter when the selection runs past it", async () => {
    const footer = document.createElement("p")
    footer.textContent = "Direitos reservados"
    host.after(footer)
    const written: string[] = []
    spyOn(navigator.clipboard, "writeText").and.callFake((text: string) => {
      written.push(text)
      return Promise.resolve()
    })

    const range = document.createRange()
    range.setStart(host.querySelector('verse[id="39"]') as Node, 0)
    range.setEnd(footer, footer.childNodes.length)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    component["sync"]()
    await component.copy()

    expect(written[0]).toBe("Palavras do versículo 39. (Mateus 22,39)")
    footer.remove()
  })

  it("forgets it copied once something else is selected", async () => {
    spyOn(navigator.clipboard, "writeText").and.resolveTo()
    selectVerses(host, 37, 37)
    await component.copy()
    expect(component.copied).toBeTrue()

    selectVerses(host, 38, 39)

    expect(component.copied).toBeFalse()
    expect(component["copiedTimer"]).toBeUndefined()
  })

  it("copies the words without the verse numbers", async () => {
    // A verse as the reader renders it: number, marker, then the words.
    // Built inside the block the fixture already put on the page, since the
    // component reads the first .bookBlock it finds.
    host.innerHTML = ""
    const verse = document.createElement("verse")
    verse.id = "37"
    verse.innerHTML =
      '<span class="verseNumber">37</span>' +
      '<span class="footnoteIndicator">*</span>' +
      '<div class="chapterNumber">22</div>' +
      "<h3>O maior mandamento</h3>" +
      '<span class="verseRun">Jesus disse-lhe:</span>' +
      '<span class="references"><span class="verseRun">Dt 6,5</span></span>' +
      "<br>" +
      '<span class="verseRun">Amarás ao Senhor,</span>' +
      '<span class="verseRun verseGap"> </span>'
    host.appendChild(verse)

    const written: string[] = []
    spyOn(navigator.clipboard, "writeText").and.callFake((text: string) => {
      written.push(text)
      return Promise.resolve()
    })

    const range = document.createRange()
    range.selectNodeContents(verse)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    component["sync"]()

    await component.copy()

    expect(written[0]).toBe(
      "Jesus disse-lhe:\nAmarás ao Senhor, (Mateus 22,37)",
    )
  })

  it("copies the selected words with their reference", async () => {
    const written: string[] = []
    spyOn(navigator.clipboard, "writeText").and.callFake((text: string) => {
      written.push(text)
      return Promise.resolve()
    })
    selectVerses(host, 37, 37)

    await component.copy()

    expect(written.length).toBe(1)
    expect(written[0]).toContain("(Mateus 22,37)")
  })

  it("names the colour on each swatch", () => {
    selectVerses(host, 37, 37)

    const names = Array.from(
      fixture.nativeElement.querySelectorAll(".mark-swatch"),
    ).map((swatch) => (swatch as HTMLElement).getAttribute("aria-label"))

    // Four buttons all called "Marcar 22,37" told a screen reader nothing.
    expect(names).toEqual([
      "Marcar 22,37 a amarelo",
      "Marcar 22,37 a verde",
      "Marcar 22,37 a azul",
      "Marcar 22,37 a rosa",
    ])
  })

  it("forgets it copied when a verse with the same words is selected", async () => {
    // A refrain: two verses that read the same. The old check compared only
    // the words, so the timer meant for the first dismissed the second.
    for (const number of [37, 38]) {
      const verse = host.querySelector(`verse[id="${number}"]`) as HTMLElement
      verse.textContent = "Porque o seu amor é para sempre. "
    }
    spyOn(navigator.clipboard, "writeText").and.resolveTo()
    selectVerses(host, 37, 37)
    await component.copy()
    expect(component.copied).toBeTrue()

    selectVerses(host, 38, 38)

    expect(component.copied).toBeFalse()
    expect(component["copiedTimer"]).toBeUndefined()
  })

  it("does not paint over a colour chosen after the marks came off", () => {
    highlights.toggle("mat", 22, 37, "green")
    const undo = new Subject<void>()
    spyOn(TestBed.inject(MatSnackBar), "open").and.returnValue({
      onAction: () => undo.asObservable(),
    } as MatSnackBarRef<TextOnlySnackBar>)
    selectVerses(host, 37, 37)
    component.clearMarks()

    // The reader marks it again, in another colour, before pressing "Anular".
    highlights.toggle("mat", 22, 37, "pink")
    undo.next()

    expect(highlights.colorFor("mat", 22, 37)).toBe("pink")
  })

  it("lets the marks it took off be put back", () => {
    highlights.toggle("mat", 22, 37, "green")
    highlights.toggle("mat", 22, 38, "pink")
    const undo = new Subject<void>()
    const open = spyOn(TestBed.inject(MatSnackBar), "open").and.returnValue({
      onAction: () => undo.asObservable(),
    } as MatSnackBarRef<TextOnlySnackBar>)
    selectVerses(host, 37, 39)

    component.clearMarks()
    expect(highlights.colorFor("mat", 22, 37)).toBeUndefined()
    expect(open).toHaveBeenCalledWith(
      "2 marcas retiradas",
      "Anular",
      jasmine.any(Object),
    )

    undo.next()
    expect(highlights.colorFor("mat", 22, 37)).toBe("green")
    expect(highlights.colorFor("mat", 22, 38)).toBe("pink")
  })

  it("offers nothing to undo when there was no mark to take off", () => {
    const open = spyOn(TestBed.inject(MatSnackBar), "open")
    selectVerses(host, 37, 37)

    component.clearMarks()

    expect(open).not.toHaveBeenCalled()
  })

  it("shows that copying failed, instead of doing nothing", async () => {
    spyOn(navigator.clipboard, "writeText").and.rejectWith(new Error("denied"))
    selectVerses(host, 37, 37)

    await component.copy()

    expect(component.copyFailed).toBeTrue()
    expect(
      fixture.nativeElement
        .querySelector(".bar-action:last-child mat-icon")
        .textContent.trim(),
    ).toBe("error")
  })

  it("grows from the side of the bar that faces the selection", () => {
    const place = SelectionActionsComponent["place"]
    const rect = (top: number) =>
      ({ top, bottom: top + 20, left: 300, width: 100, height: 20 }) as DOMRect

    // Room above: the bar sits over the words and grows up out of them.
    expect(place(rect(400)).below).toBeFalse()
    // None: it goes underneath, and has to grow downwards instead.
    expect(place(rect(10)).below).toBeTrue()
    // Across the bar, the origin is over the middle of the selection.
    const placed = place(rect(400))
    expect(placed.left + placed.originX).toBe(350)
  })

  it("ignores a selection that touches no verse", () => {
    const stray = document.createElement("p")
    stray.textContent = "fora do texto"
    document.body.appendChild(stray)
    const range = document.createRange()
    range.selectNodeContents(stray)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)

    component["sync"]()

    expect(component.position).toBeNull()
    stray.remove()
  })
})
