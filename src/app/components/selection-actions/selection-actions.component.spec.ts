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
