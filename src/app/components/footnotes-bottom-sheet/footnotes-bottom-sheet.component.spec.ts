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
    toastSpy = createSpyObj("ToastService", ["showReturn", "bringToFront"])

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

  it("adds no space around a reference, between it and the punctuation", () => {
    bibleRefSpy.extract.mockImplementation((text: string) =>
      text.startsWith("See")
        ? [{ match: "Gen 1:1", index: 4, book: "Gen", chapter: 1 }]
        : [],
    )
    bookServiceSpy.findBook.mockReturnValue({ id: "gen" } as Book)
    bookServiceSpy.getUrlAbrv.mockReturnValue("gn")
    fixture.componentRef.changeDetectorRef.markForCheck()
    fixture.detectChanges()

    const item = fixture.nativeElement.querySelector(".footnote-item")
    expect(item.querySelector("a").textContent).toBe("Gen 1:1")
    expect(item.textContent.replace(/\s+/g, " ").trim()).toBe("1a See Gen 1:1.")
  })

  it("puts a toast's way back above itself on opening", async () => {
    bibleRefSpy.extract.mockReturnValue([])
    await fixture.whenStable()
    expect(toastSpy.bringToFront).toHaveBeenCalled()
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

  // On a 393 px phone justified notes opened rivers while the reader was ragged.
  it("sets the notes ragged-right on a phone until justified is chosen", () => {
    // The runner's frame width is the viewport the media queries see.
    const frame = window.frameElement as HTMLElement | null
    expect(frame, "the specs run in a frame").toBeTruthy()
    const width = frame?.style.width ?? ""
    bibleRefSpy.extract.mockReturnValue([])
    fixture.detectChanges()
    const container = (fixture.nativeElement as HTMLElement).querySelector(
      ".footnotes-container",
    ) as HTMLElement
    try {
      if (frame) frame.style.width = "390px"
      expect(getComputedStyle(container).textAlign).toBe("start")

      document.documentElement.classList.add("justified-text")
      expect(getComputedStyle(container).textAlign).toBe("justify")
    } finally {
      document.documentElement.classList.remove("justified-text")
      if (frame) frame.style.width = width
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
