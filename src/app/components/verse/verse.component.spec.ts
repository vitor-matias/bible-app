import { SimpleChange } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
import { provideRouter } from "@angular/router"
import { Subject } from "rxjs"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { VerseComponent } from "./verse.component"

const TRANSPARENT = "rgba(0, 0, 0, 0)"

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
        normalizedText: "In the beginning...",
      },
    ],
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
  let dismissed: Subject<void>

  beforeEach(async () => {
    mockBibleRef = jasmine.createSpyObj("BibleReferenceService", ["extract"])
    mockBibleRef.extract.and.returnValue([])

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
    dismissed = new Subject<void>()
    spyOn(mockBottomSheet, "open").and.returnValue({
      afterDismissed: () => dismissed.asObservable(),
    } as ReturnType<MatBottomSheet["open"]>)
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
            { type: "text", text: "intro", normalizedText: "intro" },
            {
              type: "section",
              tag: "s2",
              text: "Section Title",
              normalizedText: "Section Title",
            },
            { type: "text", text: "more", normalizedText: "more" },
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
            { type: "text", text: "intro", normalizedText: "intro" },
            { type: "text", text: "more", normalizedText: "more" },
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
            {
              type: "section",
              tag: "s1",
              text: "Main",
              normalizedText: "Main",
            },
            {
              type: "section",
              tag: "s2",
              text: "First Sub",
              normalizedText: "First Sub",
            },
            {
              type: "section",
              tag: "s2",
              text: "Second Sub",
              normalizedText: "Second Sub",
            },
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
        makeVerse({
          text: [
            { type: "text", text: "plain text", normalizedText: "plain text" },
          ],
        }),
      )
      expect(component.hasFootnotes).toBe(false)
    })

    it("should be true when footnotes are present", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "some text", normalizedText: "some text" },
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
            { type: "text", text: "verse text", normalizedText: "verse text" },
            { type: "references", text: "Gn 1,1", normalizedText: "Gn 1,1" },
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
            { type: "text", text: "plain", normalizedText: "plain" },
            { type: "paragraph", text: " ", normalizedText: " " },
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
            { type: "references", text: "ref", normalizedText: "ref" },
            {
              type: "quote",
              text: "quoted",
              normalizedText: "quoted",
              identLevel: 1,
            },
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
            { type: "references", text: "ref", normalizedText: "ref" },
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
            {
              type: "text",
              text: "first visible",
              normalizedText: "first visible",
            },
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
        { type: "section", tag: "s2", text: "title", normalizedText: "title" },
        { type: "text", text: "in section", normalizedText: "in section" },
      ]
      setData(component, makeVerse({ text: data }))
      expect(component.isInSection(data, 1)).toBe(true)
    })

    it("should return false when a paragraph precedes the s2 section", () => {
      const data: TextType[] = [
        { type: "section", tag: "s2", text: "title", normalizedText: "title" },
        { type: "paragraph", text: " ", normalizedText: " " },
        {
          type: "text",
          text: "after paragraph",
          normalizedText: "after paragraph",
        },
      ]
      setData(component, makeVerse({ text: data }))
      expect(component.isInSection(data, 2)).toBe(false)
    })

    it("should return false when a quote precedes the position", () => {
      const data: TextType[] = [
        { type: "section", tag: "s2", text: "title", normalizedText: "title" },
        {
          type: "quote",
          text: "quoted",
          normalizedText: "quoted",
          identLevel: 1,
        },
        { type: "text", text: "after quote", normalizedText: "after quote" },
      ]
      setData(component, makeVerse({ text: data }))
      expect(component.isInSection(data, 2)).toBe(false)
    })

    it("should return false when no s2 section exists before position", () => {
      const data: TextType[] = [
        { type: "text", text: "just text", normalizedText: "just text" },
        { type: "text", text: "more text", normalizedText: "more text" },
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
            {
              type: "section",
              tag: "s2",
              text: "title",
              normalizedText: "title",
            },
            { type: "text", text: "in section", normalizedText: "in section" },
            { type: "paragraph", text: " ", normalizedText: " " },
            {
              type: "text",
              text: "after paragraph",
              normalizedText: "after paragraph",
            },
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
            {
              type: "section",
              tag: "s2",
              text: "title",
              normalizedText: "title",
            },
            { type: "text", text: "in section", normalizedText: "in section" },
            {
              type: "quote",
              text: "quoted",
              normalizedText: "quoted",
              identLevel: 1,
            },
            {
              type: "text",
              text: "after quote",
              normalizedText: "after quote",
            },
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
            {
              type: "quote",
              text: "quoted",
              normalizedText: "quoted",
              identLevel: 1,
            },
            { type: "text", text: "after", normalizedText: "after" },
            { type: "paragraph", text: " ", normalizedText: " " },
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
            { type: "text", text: "line", normalizedText: "line" },
            { type: "paragraph", text: " ", normalizedText: " " },
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
            { type: "text", text: "first", normalizedText: "first" },
            { type: "footnote", text: "note", reference: "a" },
            {
              type: "quote",
              text: "quoted",
              normalizedText: "quoted",
              identLevel: 1,
            },
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
            { type: "text", text: "first", normalizedText: "first" },
            { type: "paragraph", text: " ", normalizedText: " " },
            {
              type: "quote",
              text: "quoted",
              normalizedText: "quoted",
              identLevel: 1,
            },
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
        makeVerse({
          text: [
            {
              type: "text",
              text: "only element",
              normalizedText: "only element",
            },
          ],
        }),
      )
      component.nextVerseStartsWithQuote = true

      expect(component.checkNextIsQuote(0)).toBe(true)
    })

    it("should return false when next element is not a quote", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "first", normalizedText: "first" },
            { type: "paragraph", text: " ", normalizedText: " " },
            {
              type: "text",
              text: "not a quote",
              normalizedText: "not a quote",
            },
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
          { type: "text", text: "intro", normalizedText: "intro" },
          { type: "paragraph", text: " ", normalizedText: " " },
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
          {
            type: "section",
            tag: "s1",
            text: "title",
            normalizedText: "title",
          },
          { type: "paragraph", text: " ", normalizedText: " " },
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
          {
            type: "section",
            tag: "s1",
            text: "title",
            normalizedText: "title",
          },
          { type: "paragraph", text: " ", normalizedText: " " },
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
          { type: "text", text: "before", normalizedText: "before" },
          { type: "paragraph", text: " ", normalizedText: " " },
        ],
      })
      setData(component, data)

      expect(
        component.shouldShowParagraph(data, data.text[1] as Paragraph, 1),
      ).toBe(true)
    })
  })

  describe("a11y — text body tabindex and role", () => {
    it("should not render tabindex or role on text span when verse has no footnotes", () => {
      setData(
        component,
        makeVerse({
          text: [{ type: "text", text: "plain", normalizedText: "plain" }],
        }),
      )
      fixture.detectChanges()
      const interactive = fixture.nativeElement.querySelectorAll(
        ".interactive[tabindex='0'][role='button']",
      )
      expect(interactive.length).toBe(0)
    })

    it("should render tabindex and role on text span when verse has footnotes", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "verse text", normalizedText: "verse text" },
            { type: "footnote", text: "note", reference: "a" },
          ],
        }),
      )
      fixture.detectChanges()
      const interactive = fixture.nativeElement.querySelectorAll(
        ".interactive[tabindex='0'][role='button']",
      )
      expect(interactive.length).toBeGreaterThan(0)
    })
  })

  describe("deep-link highlight", () => {
    /** Mirrors what BibleReaderAnimationService puts on the <verse> host. */
    function highlightHost(): HTMLElement {
      const host = fixture.nativeElement as HTMLElement
      host.classList.add("verse-highlight")
      fixture.detectChanges()
      return host
    }

    it("should mark the text run so the stroke can be painted on it", () => {
      setData(
        component,
        makeVerse({
          text: [{ type: "text", text: "plain", normalizedText: "plain" }],
        }),
      )
      highlightHost()

      const run = fixture.nativeElement.querySelector(
        ".verseRun",
      ) as HTMLElement
      expect(run.textContent).toContain("plain")
      expect(getComputedStyle(run).backgroundColor).not.toBe(TRANSPARENT)
    })

    it("should leave the run unpainted while the verse is not highlighted", () => {
      setData(
        component,
        makeVerse({
          text: [{ type: "text", text: "plain", normalizedText: "plain" }],
        }),
      )
      fixture.detectChanges()

      const run = fixture.nativeElement.querySelector(
        ".verseRun",
      ) as HTMLElement
      expect(getComputedStyle(run).backgroundColor).toBe(TRANSPARENT)
    })

    it("should never paint the inline host, whose line fragments would colour the gaps between verses", () => {
      setData(
        component,
        makeVerse({
          text: [{ type: "text", text: "plain", normalizedText: "plain" }],
        }),
      )
      const host = highlightHost()

      const style = getComputedStyle(host)
      expect(style.backgroundImage).toBe("none")
      expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)")
    })

    it("should paint the verse number so it is not left out of the stroke", () => {
      setData(
        component,
        makeVerse({
          number: 2,
          text: [{ type: "text", text: "plain", normalizedText: "plain" }],
        }),
      )
      highlightHost()

      const number = fixture.nativeElement.querySelector(
        ".verseNumber",
      ) as HTMLElement
      expect(getComputedStyle(number).backgroundColor).not.toBe(TRANSPARENT)
    })

    it("should wrap the space in front of a verse number in a run so the stroke does not break", () => {
      setData(
        component,
        makeVerse({
          number: 2,
          text: [{ type: "text", text: "plain", normalizedText: "plain" }],
        }),
      )
      highlightHost()

      const gap = fixture.nativeElement.querySelector(
        ".verseRun",
      ) as HTMLElement
      expect(gap.textContent).toBe(" ")
      expect(getComputedStyle(gap).backgroundColor).not.toBe(TRANSPARENT)
    })

    it("should paint a poetry verse number once, on the wrapper rather than on both it and its digits", () => {
      setData(
        component,
        makeVerse({
          number: 3,
          text: [
            {
              type: "quote",
              text: "a line of poetry",
              normalizedText: "a line of poetry",
              identLevel: 1,
            },
          ],
        }),
      )
      highlightHost()

      const wrapper = fixture.nativeElement.querySelector(
        ".quoteVerseNumber",
      ) as HTMLElement
      const digits = wrapper.querySelector(".verseNumber") as HTMLElement
      expect(getComputedStyle(wrapper).backgroundColor).not.toBe(TRANSPARENT)
      expect(getComputedStyle(digits).backgroundColor).toBe(TRANSPARENT)
    })

    function withFootnote(): HTMLElement {
      setData(
        component,
        makeVerse({
          number: 2,
          text: [
            { type: "text", text: "plain", normalizedText: "plain" },
            { type: "footnote", text: "uma nota", reference: "a" },
          ],
        }),
      )
      fixture.detectChanges()
      return fixture.nativeElement.querySelector(
        ".footnoteIndicator",
      ) as HTMLElement
    }

    it("should paint the footnote marker so it is not left out of the stroke", () => {
      const marker = withFootnote()
      // Read the style only after highlighting: reading it first starts the
      // background-color transition, and the value would be its start colour.
      highlightHost()

      expect(getComputedStyle(marker).backgroundColor).not.toBe(TRANSPARENT)
    })

    // Padding does not move an inline box but does enlarge the border box the
    // browser hit-tests, and the marker is a button: a taller one would cover
    // the line below for the 2.5s the highlight lasts.
    it("should not grow the footnote button's hit area while highlighted", () => {
      const marker = withFootnote()
      const restingPadding = getComputedStyle(marker).paddingBottom

      highlightHost()

      expect(getComputedStyle(marker).paddingBottom).toBe(restingPadding)
    })

    it("should wrap the space before a references block so the stroke does not break", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "plain", normalizedText: "plain" },
            { type: "references", text: "Jo 1,1", normalizedText: "Jo 1,1" },
          ],
        }),
      )
      highlightHost()

      const gap = fixture.nativeElement.querySelector(
        ".references > .verseRun",
      ) as HTMLElement
      expect(gap.textContent).toBe(" ")
      expect(getComputedStyle(gap).backgroundColor).not.toBe(TRANSPARENT)
    })

    it("should wrap the space after a line of poetry so the stroke does not break", () => {
      setData(
        component,
        makeVerse({
          number: 3,
          text: [
            {
              type: "quote",
              text: "a line of poetry",
              normalizedText: "a line of poetry",
              identLevel: 1,
            },
          ],
        }),
      )
      highlightHost()

      const runs = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(".verseRun"),
      ) as HTMLElement[]
      const trailing = runs.find((run) => run.textContent === " ")
      expect(trailing).toBeTruthy()
      expect(
        getComputedStyle(trailing as HTMLElement).backgroundColor,
      ).not.toBe(TRANSPARENT)
    })

    it("should not paint the quote line wrapper, whose box extends past the end of the line", () => {
      setData(
        component,
        makeVerse({
          number: 3,
          text: [
            {
              type: "quote",
              text: "a line of poetry",
              normalizedText: "a line of poetry",
              identLevel: 1,
            },
          ],
        }),
      )
      highlightHost()

      const wrapper = fixture.nativeElement.querySelector(
        ".quoteLineWrapper",
      ) as HTMLElement
      expect(getComputedStyle(wrapper).backgroundColor).toBe(TRANSPARENT)
    })
  })

  describe("toggleFootnotes", () => {
    it("should open bottom sheet when footnotes exist", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "verse", normalizedText: "verse" },
            { type: "footnote", text: "note", reference: "a" },
          ],
        }),
      )

      component.toggleFootnotes()
      expect(mockBottomSheet.open).toHaveBeenCalled()
    })

    it("should not open bottom sheet when no footnotes", () => {
      setData(
        component,
        makeVerse({
          text: [{ type: "text", text: "verse", normalizedText: "verse" }],
        }),
      )

      component.toggleFootnotes()
      expect(mockBottomSheet.open).not.toHaveBeenCalled()
    })

    it("should disable restoreFocus and refocus the trigger without scrolling on dismiss", () => {
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "verse", normalizedText: "verse" },
            { type: "footnote", text: "note", reference: "a" },
          ],
        }),
      )

      const trigger = document.createElement("span")
      const focusSpy = spyOn(trigger, "focus")

      component.toggleFootnotes({ currentTarget: trigger } as unknown as Event)

      // Material's own restore-focus scrolls the marker into view, which jumps
      // the reader to the chapter start in paged mode — so we opt out of it.
      expect(mockBottomSheet.open).toHaveBeenCalledWith(
        jasmine.anything(),
        jasmine.objectContaining({ restoreFocus: false }),
      )
      // Focus is only restored after the sheet closes, and without scrolling.
      expect(focusSpy).not.toHaveBeenCalled()
      dismissed.next()
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    })
  })

  describe("blank elements in the source text", () => {
    /**
     * A blank line is two forced breaks with nothing rendered between them.
     * Counting <br> elements would just track the markup; this tracks what
     * the reader sees.
     */
    function hasBlankLine(host: HTMLElement): boolean {
      const breaks = Array.from(host.querySelectorAll("br"))
      return breaks.some((br) => {
        let node = br.nextSibling
        while (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement
            if (element.tagName === "BR") return true
            if (element.textContent?.trim()) return false
          } else if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent?.trim()) return false
          }
          node = node.nextSibling
        }
        return false
      })
    }

    /**
     * Psalm 1,2 as the API serves it: a run of prose inside a poetry group,
     * with an empty text element the USFM left behind, then the next line.
     */
    function psalmVerse(): Verse {
      return makeVerse({
        number: 2,
        text: [
          { type: "quote", text: "\u200b", normalizedText: "" },
          {
            type: "text",
            text: "antes põe o seu enlevo na lei do ",
            normalizedText: "",
          },
          { type: "text", text: "Senhor", normalizedText: "", allCaps: true },
          { type: "text", text: "", normalizedText: "" },
          {
            type: "quote",
            text: "e nela medita dia e noite.",
            normalizedText: "",
          },
        ] as TextType[],
      })
    }

    it("drops an empty element instead of printing a blank line for it", () => {
      setData(component, psalmVerse())

      const rendered = component.displayGroups.flatMap((group) =>
        group.elements.map((element) => element.originalIndex),
      )
      expect(rendered).not.toContain(3)
      expect(rendered).toContain(4)
    })

    it("keeps a prose run on one line, breaking only before the poetry", () => {
      setData(component, psalmVerse())
      fixture.detectChanges()

      // Every quote group brings its own break, so the prose needs none of
      // its own: "antes põe o seu enlevo na lei do" and "Senhor" stay on one
      // line, with nothing breaking between them.
      const wrapper = fixture.nativeElement.querySelector(".quoteLineWrapper")
      expect(wrapper.querySelectorAll("br").length).toBe(0)
      expect(hasBlankLine(fixture.nativeElement)).toBeFalse()
    })

    it("renders that verse as a single line of prose", () => {
      setData(component, psalmVerse())
      fixture.detectChanges()

      const wrapper = fixture.nativeElement.querySelector(".quoteLineWrapper")
      expect(wrapper.textContent.replace(/\s+/g, " ")).toContain(
        "antes põe o seu enlevo na lei do Senhor",
      )
    })

    it("keeps an empty paragraph element, which is the paragraph break", () => {
      // Psalm 1,3 ends on one: its text is just a newline, but dropping it
      // ran the next paragraph on into the end of this verse.
      setData(
        component,
        makeVerse({
          number: 3,
          text: [
            {
              type: "quote",
              text: "em tudo o que faz é bem sucedido.",
              normalizedText: "",
            },
            { type: "paragraph", text: "\n", normalizedText: "" },
          ] as TextType[],
        }),
      )

      const rendered = component.displayGroups.flatMap((group) =>
        group.elements.map((element) => element.originalIndex),
      )
      expect(rendered).toContain(1)
    })

    it("still starts poetry on its own line after prose", () => {
      setData(
        component,
        makeVerse({
          number: 1,
          text: [
            { type: "text", text: "Jesus disse-lhe:", normalizedText: "" },
            {
              type: "quote",
              text: "Amarás ao Senhor,",
              normalizedText: "",
            },
          ] as TextType[],
        }),
      )
      fixture.detectChanges()

      // The quote group brings the break itself, so the poetry starts on a
      // new line with no blank one in front of it.
      expect(hasBlankLine(fixture.nativeElement)).toBeFalse()
    })
  })

  describe("nextIsQuoteStates", () => {
    it("precomputes the flag the template used to call per change detection", () => {
      component.data = {
        number: 1,
        bookId: "gen",
        text: [
          { type: "text", text: "Disse:" },
          { type: "quote", text: "«Faça-se a luz.»" },
        ],
      } as unknown as Verse
      component.ngOnChanges({})

      expect(component.nextIsQuoteStates[0]).toBeTrue()
      expect(component.nextIsQuoteStates[0]).toBe(component.checkNextIsQuote(0))
      expect(component.nextIsQuoteStates[1]).toBe(component.checkNextIsQuote(1))
    })
  })
})
