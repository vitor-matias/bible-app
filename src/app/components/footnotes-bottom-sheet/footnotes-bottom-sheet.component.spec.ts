import { ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { By } from "@angular/platform-browser"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { ToastService } from "../../services/toast.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { FootnotesBottomSheetComponent } from "./footnotes-bottom-sheet.component"

describe("FootnotesBottomSheetComponent", () => {
  let component: FootnotesBottomSheetComponent
  let fixture: ComponentFixture<FootnotesBottomSheetComponent>
  let bottomSheetRefSpy: SpyObj<
    MatBottomSheetRef<FootnotesBottomSheetComponent>
  >
  let bibleRefSpy: SpyObj<BibleReferenceService>
  let bookServiceSpy: SpyObj<BookService>
  let analyticsServiceSpy: SpyObj<AnalyticsService>
  let toastSpy: SpyObj<ToastService>

  const mockData = {
    footnotes: [
      { reference: "1a", text: "See Gen 1:1." },
      { reference: "1b", text: "Just normal text." },
    ],
    verse: {
      bookId: "JHN",
      chapterNumber: 3,
      number: 16,
    },
  }

  beforeEach(async () => {
    bottomSheetRefSpy = createSpyObj("MatBottomSheetRef", ["dismiss"])
    bibleRefSpy = createSpyObj("BibleReferenceService", ["extract"])
    bookServiceSpy = createSpyObj("BookService", ["findBook", "getUrlAbrv"])
    analyticsServiceSpy = createSpyObj("AnalyticsService", ["track"])
    analyticsServiceSpy.track.mockResolvedValue(undefined)
    toastSpy = createSpyObj("ToastService", ["showReturn"])

    await TestBed.configureTestingModule({
      imports: [FootnotesBottomSheetComponent],
      providers: [
        { provide: MatBottomSheetRef, useValue: bottomSheetRefSpy },
        { provide: MAT_BOTTOM_SHEET_DATA, useValue: mockData },
        { provide: BibleReferenceService, useValue: bibleRefSpy },
        { provide: BookService, useValue: bookServiceSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: ActivatedRoute, useValue: {} }, // For RouterModule
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(FootnotesBottomSheetComponent)
    component = fixture.componentInstance
  })

  it("should create", () => {
    // We mock extract to return empty array for init
    bibleRefSpy.extract.mockReturnValue([])
    fixture.detectChanges()
    expect(component).toBeTruthy()
  })

  // A reader who chose ragged-right text still got justified notes.
  it("sets the notes ragged-right when the reader chose it", () => {
    bibleRefSpy.extract.mockReturnValue([])
    fixture.detectChanges()
    const container = (fixture.nativeElement as HTMLElement).querySelector(
      ".footnotes-container",
    ) as HTMLElement
    expect(getComputedStyle(container).textAlign).toBe("justify")

    document.documentElement.classList.add("ragged-text")
    try {
      expect(getComputedStyle(container).textAlign).toBe("start")
    } finally {
      document.documentElement.classList.remove("ragged-text")
    }
  })

  it("should bind the footnotes font-size context to the gestures directive", () => {
    bibleRefSpy.extract.mockReturnValue([])
    fixture.detectChanges()

    const gestures = fixture.debugElement.query(
      By.directive(UnifiedGesturesDirective),
    )
    expect(gestures).toBeTruthy()
    expect(
      gestures.injector.get(UnifiedGesturesDirective).fontSizeContext(),
    ).toBe("footnotes")
  })

  it("should track footnotes_opened when component is initialized", () => {
    bibleRefSpy.extract.mockReturnValue([])
    fixture.detectChanges()

    // Component is already created in beforeEach
    expect(analyticsServiceSpy.track).toHaveBeenCalledWith("footnotes_opened", {
      book: "JHN",
      chapter: 3,
      verse: 16,
    })
  })

  describe("parseReferences", () => {
    it("should return the entire string when no references are extracted", () => {
      bibleRefSpy.extract.mockReturnValue([])
      const result = component.parseReferences("Just normal text.")
      expect(result.parts).toEqual(["Just normal text."])
      expect(bibleRefSpy.extract).toHaveBeenCalledWith(
        "Just normal text.",
        "JHN",
        3,
      )
    })

    it("should split string around extracted references", () => {
      bibleRefSpy.extract.mockReturnValue([
        {
          index: 4,
          match: "Gen 1:1",
          book: "GEN",
          chapter: 1,
          verses: [{ type: "single", verse: 1 }],
        },
      ])

      const result = component.parseReferences("See Gen 1:1.")
      expect(result.parts.length).toBe(3)
      expect(result.parts[0]).toBe("See ")
      expect(result.parts[1]).toEqual(
        expect.objectContaining({ book: "GEN", match: "Gen 1:1" }),
      )
      expect(result.parts[2]).toBe(".")
    })
  })

  // "Jb 38,1-39,30" spans chapters and has no `verses`: the link opened at
  // the top of chapter 38 here, though at verse 1 in the iOS sheet.
  it("opens a cross-chapter reference at its first verse", () => {
    bookServiceSpy.findBook.mockReturnValue({ id: "job" } as Book)
    bookServiceSpy.getUrlAbrv.mockReturnValue("jb")
    bibleRefSpy.extract.mockImplementation((text: string) =>
      text.startsWith("See")
        ? [
            {
              index: 4,
              match: "Jb 38,5-39,30",
              book: "job",
              chapter: 38,
              crossChapter: {
                type: "crossChapterRange",
                startChapter: 38,
                startVerse: 5,
                endChapter: 39,
                endVerse: 30,
              },
            },
          ]
        : [],
    )
    fixture.detectChanges()

    const link = fixture.debugElement
      .query(By.directive(RouterLink))
      .injector.get(RouterLink)
    expect(link.queryParams).toEqual({ verseStart: 5 })
  })

  describe("getVerseQueryParams", () => {
    it("should return null for undefined or empty verses array", () => {
      expect(component.getVerseQueryParams(undefined)).toBeNull()
      expect(component.getVerseQueryParams([])).toBeNull()
    })

    it("should format single verse correctly", () => {
      const qp = component.getVerseQueryParams([{ type: "single", verse: 5 }])
      expect(qp).toEqual({ verseStart: 5 })
    })

    it("should format range verse correctly", () => {
      const qp = component.getVerseQueryParams([
        { type: "range", start: 3, end: 5 },
      ])
      expect(qp).toEqual({ verseStart: 3, verseEnd: 5 })
    })

    it("should fallback to null for unknown types", () => {
      // @ts-expect-error Testing invalid runtime pass
      const qp = component.getVerseQueryParams([{ type: "unknown" }])
      expect(qp).toBeNull()
    })
  })

  describe("getAbrv", () => {
    it("should fetch book abbreviation correctly", () => {
      const mockBook = { abrv: "Gn" } as unknown as ReturnType<
        BookService["findBook"]
      >
      bookServiceSpy.findBook.mockReturnValue(mockBook)
      bookServiceSpy.getUrlAbrv.mockReturnValue("gn")

      const abrv = component.getAbrv("GEN")

      expect(abrv).toBe("gn")
      expect(bookServiceSpy.findBook).toHaveBeenCalledWith("GEN")
      expect(bookServiceSpy.getUrlAbrv).toHaveBeenCalledWith(mockBook)
    })
  })

  describe("close", () => {
    it("should dismiss the bottom sheet", () => {
      component.close()
      expect(bottomSheetRefSpy.dismiss).toHaveBeenCalled()
    })
  })

  // Following a reference in a note left no way back to the verse.
  describe("following a reference", () => {
    it("closes the sheet and offers the way back to the verse", () => {
      bibleRefSpy.extract.mockImplementation((text: string) =>
        text.startsWith("See")
          ? [
              {
                index: 4,
                match: "Gen 1:1",
                book: "GEN",
                chapter: 1,
                verses: [{ type: "single", verse: 1 }],
              },
            ]
          : [],
      )
      bookServiceSpy.getUrlAbrv.mockReturnValue("gn")
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigateByUrl")
        .mockResolvedValue(true)
      fixture.detectChanges()

      const link: HTMLAnchorElement =
        fixture.nativeElement.querySelector(".footnote-item a")
      expect(link.textContent).toBe("Gen 1:1")
      link.click()

      expect(navigate).toHaveBeenCalled()
      expect(bottomSheetRefSpy.dismiss).toHaveBeenCalled()
      expect(toastSpy.showReturn).toHaveBeenCalledTimes(1)
      expect(toastSpy.showReturn).toHaveBeenCalledWith(mockData.verse)
    })
  })

  it("closes the gaps around brackets and before punctuation", () => {
    bibleRefSpy.extract.mockReturnValue([])
    expect(component.parseReferences("Cf. ( 7,50-52 ; 19,39 ).").parts).toEqual(
      ["Cf. (7,50-52; 19,39)."],
    )
  })
})
