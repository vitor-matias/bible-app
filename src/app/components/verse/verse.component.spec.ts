import { SimpleChange } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
import { provideRouter } from "@angular/router"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { VerseComponent } from "./verse.component"

function makeVerse(overrides: Partial<Verse> = {}): Verse {
  return {
    bookId: "gen",
    chapterNumber: 1,
    number: 1,
    verseLabel: "1",
    text: [{ type: "text", text: "In the beginning..." }],
    ...overrides,
  }
}

function setData(component: VerseComponent, data: Verse): void {
  const prev = component.data
  component.data = data
  component.ngOnChanges({
    data: new SimpleChange(prev, data, prev === undefined),
  })
}

describe("VerseComponent", () => {
  let component: VerseComponent
  let fixture: ComponentFixture<VerseComponent>
  let mockBibleRef: jasmine.SpyObj<BibleReferenceService>
  let mockBottomSheet: MatBottomSheet

  beforeEach(async () => {
    mockBibleRef = jasmine.createSpyObj("BibleReferenceService", ["extract"])
    mockBibleRef.extract.and.returnValue([])

    mockBottomSheet = jasmine.createSpyObj("MatBottomSheet", ["open"])

    await TestBed.configureTestingModule({
      imports: [VerseComponent, MatBottomSheetModule],
      providers: [
        provideRouter([]),
        { provide: BibleReferenceService, useValue: mockBibleRef },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(VerseComponent)
    component = fixture.componentInstance
    mockBottomSheet = (component as unknown as { bottomSheet: MatBottomSheet })
      .bottomSheet
    spyOn(mockBottomSheet, "open")
  })

  it("should create", () => {
    setData(component, makeVerse())
    fixture.detectChanges()
    expect(component).toBeTruthy()
  })

  describe("ngOnChanges — chapterNumberDisplayIndex", () => {
    it("should be -1 for regular verses (number > 0)", () => {
      setData(component, makeVerse({ number: 5 }))
      expect(component.chapterNumberDisplayIndex).toBe(-1)
    })

    it("should target s2 section index for verse 0 with s2 section", () => {
      setData(
        component,
        makeVerse({
          number: 0,
          text: [
            { type: "text", text: "intro" },
            { type: "section", tag: "s2", text: "Section Title" },
            { type: "text", text: "more" },
          ],
        }),
      )
      expect(component.chapterNumberDisplayIndex).toBe(1)
    })

    it("should target last element for verse 0 without s2 section", () => {
      setData(
        component,
        makeVerse({
          number: 0,
          text: [
            { type: "text", text: "intro" },
            { type: "text", text: "more" },
          ],
        }),
      )
      expect(component.chapterNumberDisplayIndex).toBe(1)
    })

    it("should target the first s2 if multiple s2 sections exist", () => {
      setData(
        component,
        makeVerse({
          number: 0,
          text: [
            { type: "section", tag: "s1", text: "Main" },
            { type: "section", tag: "s2", text: "First Sub" },
            { type: "section", tag: "s2", text: "Second Sub" },
          ],
        }),
      )
      expect(component.chapterNumberDisplayIndex).toBe(1)
    })
  })

  describe("ngOnChanges — hasFootnotes", () => {
    it("should be false when no footnotes present", () => {
      setData(
        component,
        makeVerse({ text: [{ type: "text", text: "plain text" }] }),
      )
      expect(component.hasFootnotes).toBe(false)
    })

    it("should be true when footnotes are present", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "some text" },
            { type: "footnote", text: "note content", reference: "a" },
          ],
        }),
      )
      expect(component.hasFootnotes).toBe(true)
    })
  })

  describe("ngOnChanges — parsedReferences", () => {
    it("should pre-compute references for text entries of type references", () => {
      mockBibleRef.extract.and.returnValue([])

      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "verse text" },
            { type: "references", text: "Gn 1,1" },
          ],
        }),
      )

      expect(component.parsedReferences.has(1)).toBe(true)
      expect(component.parsedReferences.has(0)).toBe(false)
    })

    it("should not compute references for non-reference text types", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "plain" },
            { type: "paragraph", text: " " },
          ],
        }),
      )

      expect(component.parsedReferences.size).toBe(0)
    })
  })

  describe("getFirstTextType", () => {
    it("should return the type of the first non-footnote, non-references element", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "footnote", text: "note", reference: "a" },
            { type: "references", text: "ref" },
            { type: "quote", text: "quoted", identLevel: 1 },
          ],
        }),
      )
      expect(component.getFirstTextType()).toBe("quote")
    })

    it("should return undefined when all elements are footnotes or references", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "footnote", text: "note", reference: "a" },
            { type: "references", text: "ref" },
          ],
        }),
      )
      expect(component.getFirstTextType()).toBeUndefined()
    })
  })

  describe("isFirstDisplayableElement", () => {
    it("should return true for the first displayable element index", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "footnote", text: "note", reference: "a" },
            { type: "text", text: "first visible" },
          ],
        }),
      )
      expect(component.isFirstDisplayableElement(1)).toBe(true)
      expect(component.isFirstDisplayableElement(0)).toBe(false)
    })
  })

  describe("isInSection", () => {
    it("should return true when an s2 section precedes the position", () => {
      const data: TextType[] = [
        { type: "section", tag: "s2", text: "title" },
        { type: "text", text: "in section" },
      ]
      setData(component, makeVerse({ text: data }))
      expect(component.isInSection(data, 1)).toBe(true)
    })

    it("should return false when a paragraph precedes the s2 section", () => {
      const data: TextType[] = [
        { type: "section", tag: "s2", text: "title" },
        { type: "paragraph", text: " " },
        { type: "text", text: "after paragraph" },
      ]
      setData(component, makeVerse({ text: data }))
      expect(component.isInSection(data, 2)).toBe(false)
    })

    it("should return false when a quote precedes the position", () => {
      const data: TextType[] = [
        { type: "section", tag: "s2", text: "title" },
        { type: "quote", text: "quoted", identLevel: 1 },
        { type: "text", text: "after quote" },
      ]
      setData(component, makeVerse({ text: data }))
      expect(component.isInSection(data, 2)).toBe(false)
    })

    it("should return false when no s2 section exists before position", () => {
      const data: TextType[] = [
        { type: "text", text: "just text" },
        { type: "text", text: "more text" },
      ]
      setData(component, makeVerse({ text: data }))
      expect(component.isInSection(data, 1)).toBe(false)
    })
  })

  describe("getDataForSection", () => {
    it("should collect elements until a paragraph is found", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "section", tag: "s2", text: "title" },
            { type: "text", text: "in section" },
            { type: "paragraph", text: " " },
            { type: "text", text: "after paragraph" },
          ],
        }),
      )

      const result = component.getDataForSection(0)
      expect(result.text.length).toBe(2)
      expect(result.text[0].type).toBe("section")
      expect(result.text[1].type).toBe("text")
    })

    it("should break on quote type (except at index 0)", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "section", tag: "s2", text: "title" },
            { type: "text", text: "in section" },
            { type: "quote", text: "quoted", identLevel: 1 },
            { type: "text", text: "after quote" },
          ],
        }),
      )

      const result = component.getDataForSection(0)
      expect(result.text.length).toBe(2)
    })

    it("should include quote at index 0 of sliced array", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "quote", text: "quoted", identLevel: 1 },
            { type: "text", text: "after" },
            { type: "paragraph", text: " " },
          ],
        }),
      )

      const result = component.getDataForSection(0)
      expect(result.text.length).toBe(2)
      expect(result.text[0].type).toBe("quote")
    })

    it("should preserve verse metadata in returned data", () => {
      setData(
        component,
        makeVerse({
          bookId: "psa",
          chapterNumber: 23,
          number: 1,
          text: [
            { type: "text", text: "line" },
            { type: "paragraph", text: " " },
          ],
        }),
      )

      const result = component.getDataForSection(0)
      expect(result.bookId).toBe("psa")
      expect(result.chapterNumber).toBe(23)
      expect(result.number).toBe(1)
    })
  })

  describe("checkNextIsQuote", () => {
    it("should return true when next displayable element after section is a quote", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "first" },
            { type: "footnote", text: "note", reference: "a" },
            { type: "quote", text: "quoted", identLevel: 1 },
          ],
        }),
      )
      component.nextVerseStartsWithQuote = false

      // getDataForSection(0) => [text] (breaks on quote at index > 0)
      // lastElementIndex = 0 + 1 - 1 = 0
      // Next displayable after index 0: footnote at 1 is skipped, quote at 2 is found
      const result = component.checkNextIsQuote(0)
      expect(result).toBe(true)
    })

    it("should return false when next displayable element is a paragraph", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "first" },
            { type: "paragraph", text: " " },
            { type: "quote", text: "quoted", identLevel: 1 },
          ],
        }),
      )
      component.nextVerseStartsWithQuote = false

      // getDataForSection(0) => [text] (breaks on paragraph)
      // lastElementIndex = 0 + 1 - 1 = 0
      // Next displayable after index 0: paragraph at 1 is displayable, not quote
      expect(component.checkNextIsQuote(0)).toBe(false)
    })

    it("should fall back to nextVerseStartsWithQuote when no more elements", () => {
      setData(
        component,
        makeVerse({ text: [{ type: "text", text: "only element" }] }),
      )
      component.nextVerseStartsWithQuote = true

      expect(component.checkNextIsQuote(0)).toBe(true)
    })

    it("should return false when next element is not a quote", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "first" },
            { type: "paragraph", text: " " },
            { type: "text", text: "not a quote" },
          ],
        }),
      )
      component.nextVerseStartsWithQuote = false

      expect(component.checkNextIsQuote(0)).toBe(false)
    })
  })

  describe("shouldShowParagraph", () => {
    it("should return false for verse 0", () => {
      const data = makeVerse({
        number: 0,
        text: [
          { type: "text", text: "intro" },
          { type: "paragraph", text: " " },
        ],
      })
      setData(component, data)

      expect(
        component.shouldShowParagraph(data, data.text[1] as Paragraph, 1),
      ).toBe(false)
    })

    it("should return true for psalms regardless of previous type", () => {
      const data = makeVerse({
        bookId: "psa",
        number: 1,
        text: [
          { type: "section", tag: "s1", text: "title" },
          { type: "paragraph", text: " " },
        ],
      })
      setData(component, data)

      expect(
        component.shouldShowParagraph(data, data.text[1] as Paragraph, 1),
      ).toBe(true)
    })

    it("should return false when preceded by a section", () => {
      const data = makeVerse({
        number: 1,
        text: [
          { type: "section", tag: "s1", text: "title" },
          { type: "paragraph", text: " " },
        ],
      })
      setData(component, data)

      expect(
        component.shouldShowParagraph(data, data.text[1] as Paragraph, 1),
      ).toBe(false)
    })

    it("should return true when preceded by text", () => {
      const data = makeVerse({
        number: 1,
        text: [
          { type: "text", text: "before" },
          { type: "paragraph", text: " " },
        ],
      })
      setData(component, data)

      expect(
        component.shouldShowParagraph(data, data.text[1] as Paragraph, 1),
      ).toBe(true)
    })
  })

  describe("toggleFootnotes", () => {
    it("should open bottom sheet when footnotes exist", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "verse" },
            { type: "footnote", text: "note", reference: "a" },
          ],
        }),
      )

      component.toggleFootnotes()
      expect(mockBottomSheet.open).toHaveBeenCalled()
    })

    it("should not open bottom sheet when no footnotes", () => {
      setData(component, makeVerse({ text: [{ type: "text", text: "verse" }] }))

      component.toggleFootnotes()
      expect(mockBottomSheet.open).not.toHaveBeenCalled()
    })
  })
})
