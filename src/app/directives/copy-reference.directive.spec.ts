import { Component, NO_ERRORS_SCHEMA, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
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
