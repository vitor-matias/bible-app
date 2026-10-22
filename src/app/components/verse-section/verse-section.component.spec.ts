import { SimpleChange } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { ToastService } from "../../services/toast.service"
import { VerseSectionComponent } from "./verse-section.component"

function makeVerse(overrides: Partial<Verse> = {}): Verse {
  return {
    bookId: "gen",
    chapterNumber: 1,
    number: 1,
    verseLabel: "1",
    text: [
      {
        type: "text",
        text: "In the beginning...",
      },
    ],
    ...overrides,
  }
}

function setData(component: VerseSectionComponent, data: Verse): void {
  const prev = component.data
  component.data = data
  component.ngOnChanges({
    data: new SimpleChange(prev, data, prev === undefined),
  })
}

describe("VerseSectionComponent", () => {
  let component: VerseSectionComponent
  let fixture: ComponentFixture<VerseSectionComponent>
  let mockBibleRef: jasmine.SpyObj<BibleReferenceService>
  let toast: jasmine.SpyObj<ToastService>

  beforeEach(async () => {
    mockBibleRef = jasmine.createSpyObj("BibleReferenceService", ["extract"])
    mockBibleRef.extract.and.returnValue([])

    toast = jasmine.createSpyObj("ToastService", ["showReturn"])

    await TestBed.configureTestingModule({
      imports: [VerseSectionComponent],
      providers: [
        provideRouter([]),
        { provide: BibleReferenceService, useValue: mockBibleRef },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(VerseSectionComponent)
    component = fixture.componentInstance
  })

  it("should create", () => {
    component.changeLine = false
    setData(component, makeVerse())
    fixture.detectChanges()
    expect(component).toBeTruthy()
  })

  // The Android bar names the section being read (NativeChromeService): the
  // heading, not the text or the references that run on from it.
  it("marks the section's own heading", () => {
    component.changeLine = false
    setData(
      component,
      makeVerse({
        text: [
          { type: "section", tag: "s2", text: "Criação do mundo" },
          { type: "references", text: "(Jo 1,1-3)" },
          { type: "text", text: "No princípio" },
        ],
      }),
    )
    fixture.detectChanges()

    const headings = fixture.nativeElement.querySelectorAll(
      "[data-section-heading]",
    ) as NodeListOf<HTMLElement>
    expect(Array.from(headings, (heading) => heading.textContent)).toEqual([
      "Criação do mundo",
    ])
  })

  describe("ngOnChanges — parsedReferences", () => {
    it("should pre-compute references for reference-type text entries", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "verse" },
            { type: "references", text: "Gn 1,1" },
          ],
        }),
      )

      expect(component.parsedReferences.has(1)).toBe(true)
      expect(component.parsedReferences.get(1)?.length).toBeGreaterThan(0)
    })

    it("should not create entries for non-reference text types", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "plain" },
            {
              type: "section",
              tag: "s2",
              text: "title",
            },
          ],
        }),
      )

      expect(component.parsedReferences.size).toBe(0)
    })

    it("should recompute when data input changes", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({
          text: [{ type: "references", text: "Gn 1,1" }],
        }),
      )

      expect(component.parsedReferences.has(0)).toBe(true)

      // Change data
      setData(
        component,
        makeVerse({
          text: [{ type: "text", text: "no refs" }],
        }),
      )

      expect(component.parsedReferences.size).toBe(0)
    })
  })

  describe("references in a heading", () => {
    // "(Mc 4,21; 9,50)": two links between the edition's own punctuation.
    const text = "(Mc 4,21; 9,50)"
    const reference = (match: string, index: number) =>
      ({ match, index, book: "mrk", chapter: 4 }) as BibleReference

    beforeEach(() => {
      mockBibleRef.extract.and.returnValue([
        reference("Mc 4,21", 1),
        reference("9,50", 10),
      ])
      component.changeLine = false
      setData(
        component,
        makeVerse({
          text: [
            { type: "section", tag: "s1", text: "Sal da terra" },
            { type: "references", text },
          ],
        }),
      )
      fixture.detectChanges()
    })

    it("keeps the edition's spacing around the links", () => {
      const references: HTMLElement =
        fixture.nativeElement.querySelector(".references")
      expect(references.textContent?.trim()).toBe(text)
    })

    it("keeps the closing dash on the heading's last line", () => {
      const sections: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll(".section .section"),
      )
      expect(sections[sections.length - 1].textContent).toBe("\u00a0— ")
    })
  })

  // Is 14,23: the verse ends on the heading of the next oracle, and verse 24
  // opens with poetry, so the heading is centred on lines of its own. As a
  // block box inside the inline text, Safari drew it over the verse's last
  // lines in the page-by-page view and justified the line before it.
  describe("a centred heading", () => {
    const isaiah14v23 = () =>
      makeVerse({
        bookId: "isa",
        chapterNumber: 14,
        number: 23,
        text: [
          { type: "text", text: "Reduzi-la-ei a um ninho de ouriços" },
          { type: "section", tag: "s2", text: "Oráculo contra os assírios" },
          { type: "references", text: "(10,5-16)" },
        ],
      })

    function render(inputs: { changeLine: boolean; beside: boolean }) {
      component.changeLine = inputs.changeLine
      component.besideChapterNumber = inputs.beside
      component.nextIsQuote = true
      setData(component, isaiah14v23())
      fixture.detectChanges()
      return fixture.nativeElement.querySelector(".center") as HTMLElement
    }

    it("is an inline-block a line wide, not a block box", () => {
      const heading = render({ changeLine: true, beside: false })

      // A line wide, so it never shares a line with the text around it.
      const line = (fixture.nativeElement as HTMLElement).parentElement
      expect(getComputedStyle(heading).display).toBe("inline-block")
      expect(heading.getBoundingClientRect().width).toBeCloseTo(
        line?.getBoundingClientRect().width ?? 0,
        0,
      )
    })

    it("ends the line of text before it with a forced break", () => {
      const heading = render({ changeLine: true, beside: false })

      expect(heading.previousElementSibling?.tagName).toBe("BR")
    })

    it("stays a table beside the chapter number, which it would drop below", () => {
      const heading = render({ changeLine: false, beside: true })

      expect(getComputedStyle(heading).display).toBe("table")
      expect(heading.previousElementSibling).toBeNull()
    })

    it("leaves a heading that runs into the text inline, with no break before it", () => {
      component.changeLine = true
      setData(
        component,
        makeVerse({
          text: [{ type: "section", tag: "s2", text: "Israel regressa" }],
        }),
      )
      fixture.detectChanges()

      const heading = fixture.nativeElement.querySelector(
        ":scope > .section",
      ) as HTMLElement
      expect(heading.classList).not.toContain("center")
      expect(getComputedStyle(heading).display).toBe("inline")
      expect(heading.previousElementSibling).toBeNull()
    })
  })

  describe("showReturnSnackbar", () => {
    it("offers the way back to this verse", () => {
      const verse = makeVerse({ chapterNumber: 3, number: 5 })
      setData(component, verse)

      component.showReturnSnackbar()

      expect(toast.showReturn).toHaveBeenCalledOnceWith(verse)
    })
  })

  describe("getVerseQueryParams", () => {
    it("should be the shared utility function", () => {
      expect(component.getVerseQueryParams).toBeDefined()
      expect(component.getVerseQueryParams([])).toBeNull()
      expect(
        component.getVerseQueryParams([{ type: "single", verse: 3 }]),
      ).toEqual({ verseStart: 3 })
    })
  })
})
