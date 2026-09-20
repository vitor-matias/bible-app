import { type ComponentFixture, TestBed } from "@angular/core/testing"
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

  it("leaves a selection in the passage open beside the chapter alone", () => {
    // The parallel as the reader renders it: its own block, inside the
    // aside, with prefixed ids. The bar marks and cites with the chapter
    // being read, so offering itself here would mark Matthew for a selection
    // made in Job.
    const aside = document.createElement("aside")
    aside.className = "study-parallel"
    const parallel = renderVerses([37, 38])
    parallel.querySelectorAll("verse").forEach((verse) => {
      verse.id = `parallel-${verse.id}`
    })
    aside.appendChild(parallel)
    document.body.appendChild(aside)

    const range = document.createRange()
    range.selectNodeContents(parallel)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    component["sync"]()

    expect(component.position).toBeNull()
    aside.remove()
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
