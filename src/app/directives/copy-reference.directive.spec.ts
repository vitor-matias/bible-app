import { Component, NO_ERRORS_SCHEMA, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatBottomSheetModule } from "@angular/material/bottom-sheet"
import { provideRouter } from "@angular/router"
import { VerseComponent } from "../components/verse/verse.component"
import { BibleReferenceService } from "../services/bible-reference.service"
import { CopyReferenceDirective } from "./copy-reference.directive"

@Component({
  imports: [CopyReferenceDirective],
  schemas: [NO_ERRORS_SCHEMA],
  // The reader puts the space between verses inside the next one.
  template: `
    <div [appCopyReference]="passage()">
      <verse id="0"><span class="section">As Bem-aventuranças</span></verse>
      <verse id="3"><span>3</span> &#8203;Felizes os pobres em espírito.</verse>
      <verse id="4">{{ " " }}<span>4</span> Felizes os que choram.</verse>
      <verse id="5">{{ " " }}<span>5</span> Felizes os mansos.</verse>
    </div>
  `,
})
class HostComponent {
  readonly passage = signal({
    book: { id: "mat", shortName: "Mateus" } as Book,
    chapter: 5,
  })
}

describe("CopyReferenceDirective", () => {
  let host: HTMLElement

  beforeEach(() => {
    const fixture = TestBed.createComponent(HostComponent)
    fixture.detectChanges()
    host = fixture.nativeElement
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
    document.getSelection()?.removeAllRanges()
  })

  const textOf = (id: string) =>
    host.querySelector(`verse[id="${id}"]`)?.lastChild as Text

  /** Selects from `start` to `end` and copies. */
  const copy = (
    start: [Text, number],
    end: [Text, number],
  ): { text: string; prevented: boolean } => {
    const range = document.createRange()
    range.setStart(...start)
    range.setEnd(...end)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const event = new ClipboardEvent("copy", {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true,
    })
    start[0].parentElement?.dispatchEvent(event)
    return {
      text: event.clipboardData?.getData("text/plain") ?? "",
      prevented: event.defaultPrevented,
    }
  }

  it("adds the reference of the verses selected", () => {
    const { text, prevented } = copy([textOf("3"), 1], [textOf("4"), 23])

    expect(prevented).toBe(true)
    expect(text).toBe(
      "Felizes os pobres em espírito. 4 Felizes os que choram. — Mateus 5,3-4",
    )
  })

  it("names one verse alone", () => {
    expect(copy([textOf("4"), 1], [textOf("4"), 9]).text).toBe(
      "Felizes — Mateus 5,4",
    )
  })

  // A triple click ends the selection at the start of the next verse.
  it("leaves out a verse only touched at its edge", () => {
    const next = host.querySelector('verse[id="4"] span')?.firstChild as Text
    expect(copy([textOf("3"), 1], [next, 0]).text).toBe(
      "Felizes os pobres em espírito. — Mateus 5,3",
    )
  })

  it("copies a heading alone as it is", () => {
    const heading = host.querySelector('verse[id="0"] span')?.firstChild as Text
    expect(copy([heading, 0], [heading, 3]).prevented).toBe(false)
  })
})

/** Ez 34,10-11 as the API serves it: the heading after verse 10 is in it. */
const EZEKIEL_34: Verse[] = [
  {
    bookId: "ezk",
    chapterNumber: 34,
    number: 10,
    verseLabel: "10",
    text: [
      { type: "text", text: "Elas nunca mais serão uma presa para eles.’»" },
      { type: "section", tag: "s2", text: "O " },
      { type: "text", text: "Senhor", allCaps: true },
      { type: "text", text: " é o Bom Pastor" },
      { type: "paragraph", text: "\n" },
    ],
  },
  {
    bookId: "ezk",
    chapterNumber: 34,
    number: 11,
    verseLabel: "11",
    text: [
      { type: "text", text: "Eis que Eu mesmo cuidarei das minhas ovelhas." },
    ],
  },
]

@Component({
  imports: [CopyReferenceDirective, VerseComponent],
  template: `
    <div [appCopyReference]="passage">
      @for (verse of verses; track verse.number) {
        <verse [id]="verse.number" class="verse" [data]="verse" />
      }
    </div>
  `,
})
class ReaderVersesComponent {
  readonly verses = EZEKIEL_34
  readonly passage = {
    book: { id: "ezk", shortName: "Ezequiel" } as Book,
    chapter: 34,
  }
}

// The reader draws a heading inside the verse before it, and "O Senhor é o
// Bom Pastor" alone was copied as «… — Ezequiel 34,10».
describe("CopyReferenceDirective in the reader's verses", () => {
  let host: HTMLElement

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MatBottomSheetModule],
      providers: [
        provideRouter([]),
        { provide: BibleReferenceService, useValue: { extract: () => [] } },
      ],
    })
    const fixture = TestBed.createComponent(ReaderVersesComponent)
    fixture.detectChanges()
    host = fixture.nativeElement
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
    document.getSelection()?.removeAllRanges()
  })

  const copy = (range: Range) => {
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const event = new ClipboardEvent("copy", {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true,
    })
    host.querySelector("verse")?.dispatchEvent(event)
    return {
      text: event.clipboardData?.getData("text/plain") ?? "",
      prevented: event.defaultPrevented,
    }
  }

  const heading = () =>
    host.querySelector('verse[id="10"] verse-section') as HTMLElement

  it("draws the heading inside verse 10", () => {
    expect(heading()?.textContent).toContain("Bom Pastor")
  })

  it("copies the heading alone as it is", () => {
    const range = document.createRange()
    range.selectNodeContents(heading())
    expect(copy(range).prevented).toBe(false)
  })

  it("names only the verse after a heading selected with it", () => {
    const range = document.createRange()
    range.setStartBefore(heading())
    range.setEndAfter(host.querySelector('verse[id="11"]') as HTMLElement)
    expect(copy(range).text).toMatch(
      /Bom Pastor[\s\S]*ovelhas\. — Ezequiel 34,11$/,
    )
  })
})
