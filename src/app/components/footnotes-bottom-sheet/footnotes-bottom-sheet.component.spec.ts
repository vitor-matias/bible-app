import { ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { ActivatedRoute } from "@angular/router"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { FootnotesBottomSheetComponent } from "./footnotes-bottom-sheet.component"

describe("FootnotesBottomSheetComponent", () => {
  let component: FootnotesBottomSheetComponent
  let fixture: ComponentFixture<FootnotesBottomSheetComponent>
  let bottomSheetRefSpy: jasmine.SpyObj<
    MatBottomSheetRef<FootnotesBottomSheetComponent>
  >
  let bibleRefSpy: jasmine.SpyObj<BibleReferenceService>
  let bookServiceSpy: jasmine.SpyObj<BookService>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>

  const mockData = {
    footnotes: [
      { reference: "1a", text: "See Gen 1:1." },
      { reference: "1b", text: "Just normal text." },
    ],
    verse: {
      bookId: "JHN",
      chapterNumber: 3,
      verseNumber: 16,
    },
  }

  beforeEach(async () => {
    bottomSheetRefSpy = jasmine.createSpyObj("MatBottomSheetRef", ["dismiss"])
    bibleRefSpy = jasmine.createSpyObj("BibleReferenceService", ["extract"])
    bookServiceSpy = jasmine.createSpyObj("BookService", [
      "findBook",
      "getUrlAbrv",
    ])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", ["track"])

    await TestBed.configureTestingModule({
      imports: [FootnotesBottomSheetComponent],
      providers: [
        { provide: MatBottomSheetRef, useValue: bottomSheetRefSpy },
        { provide: MAT_BOTTOM_SHEET_DATA, useValue: mockData },
        { provide: BibleReferenceService, useValue: bibleRefSpy },
        { provide: BookService, useValue: bookServiceSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: ActivatedRoute, useValue: {} }, // For RouterModule
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(FootnotesBottomSheetComponent)
    component = fixture.componentInstance
  })

  it("should create", () => {
    // We mock extract to return empty array for init
    bibleRefSpy.extract.and.returnValue([])
    fixture.detectChanges()
    expect(component).toBeTruthy()
  })

  it("should track footnotes_opened when component is initialized", () => {
    // Component is already created in beforeEach
    expect(analyticsServiceSpy.track).toHaveBeenCalledWith("footnotes_opened", {
      book: "JHN",
      chapter: 3,
      verse: 16,
    })
  })

  describe("parseReferences", () => {
    it("should return the entire string when no references are extracted", () => {
      bibleRefSpy.extract.and.returnValue([])
      const result = component.parseReferences("Just normal text.")
      expect(result.parts).toEqual(["Just normal text."])
      expect(bibleRefSpy.extract).toHaveBeenCalledWith(
        "Just normal text.",
        "JHN",
        3,
      )
    })

    it("should split string around extracted references", () => {
      bibleRefSpy.extract.and.returnValue([
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
        jasmine.objectContaining({ book: "GEN", match: "Gen 1:1" }),
      )
      expect(result.parts[2]).toBe(".")
    })
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
      bookServiceSpy.findBook.and.returnValue(mockBook)
      bookServiceSpy.getUrlAbrv.and.returnValue("gn")

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
})
