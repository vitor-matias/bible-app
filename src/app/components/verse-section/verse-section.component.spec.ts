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
