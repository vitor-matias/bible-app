import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { Subject } from "rxjs"
import { AnalyticsService } from "./analytics.service"
import {
  type BibleReference,
  BibleReferenceService,
} from "./bible-reference.service"
import { BookService } from "./book.service"
import {
  type FootnotesSheetState,
  type NativeChromeAction,
  NativeChromeService,
} from "./native-chrome.service"
import { NativeFootnotesService } from "./native-footnotes.service"
import { PreferencesService } from "./preferences.service"

describe("NativeFootnotesService", () => {
  let actions: Subject<NativeChromeAction>
  let nativeChrome: {
    enabled: boolean
    actions$: Subject<NativeChromeAction>
    showFootnotes: jasmine.Spy
  }
  let bibleRef: jasmine.SpyObj<BibleReferenceService>
  let router: jasmine.SpyObj<Router>
  let analytics: jasmine.SpyObj<AnalyticsService>
  let fontSize: number | null
  let service: NativeFootnotesService

  const text = "Com este título (3,11; Jo 1,15) João pretende (8-9)."
  const references: BibleReference[] = [
    {
      match: "3,11",
      index: 17,
      book: "mat",
      chapter: 3,
      verses: [{ type: "single", verse: 11 }],
    },
    {
      match: "Jo 1,15",
      index: 23,
      book: "jhn",
      chapter: 1,
      verses: [{ type: "range", start: 15, end: 18 }],
    },
  ]
  const verse = {
    bookId: "mat",
    chapterNumber: 11,
    number: 3,
    text: [],
  } as unknown as Verse

  beforeEach(() => {
    actions = new Subject()
    nativeChrome = {
      enabled: true,
      actions$: actions,
      showFootnotes: jasmine.createSpy("showFootnotes").and.resolveTo(true),
    }
    bibleRef = jasmine.createSpyObj("BibleReferenceService", ["extract"])
    bibleRef.extract.and.returnValue(references)
    router = jasmine.createSpyObj("Router", ["navigate"])
    analytics = jasmine.createSpyObj("AnalyticsService", ["track"])
    analytics.track.and.resolveTo()
    fontSize = null
    TestBed.configureTestingModule({
      providers: [
        { provide: NativeChromeService, useValue: nativeChrome },
        { provide: BibleReferenceService, useValue: bibleRef },
        { provide: Router, useValue: router },
        { provide: AnalyticsService, useValue: analytics },
        {
          provide: PreferencesService,
          useValue: { getFontSize: () => fontSize },
        },
        {
          provide: BookService,
          useValue: {
            findBook: (id: string) => ({ id }),
            findBookById: () => ({ shortName: "Mateus" }),
            getUrlAbrv: (book: { id: string }) => `url-${book.id}`,
          },
        },
      ],
    })
    service = TestBed.inject(NativeFootnotesService)
  })

  const footnote = { type: "footnote" as const, text, reference: "3." }
  const shown = (): FootnotesSheetState =>
    nativeChrome.showFootnotes.calls.mostRecent().args[0]

  it("shows the notes with their references as links", () => {
    service.open([footnote], verse)

    expect(bibleRef.extract).toHaveBeenCalledWith(text, "mat", 11)
    expect(shown()).toEqual({
      title: "Mateus 11,3",
      fontScale: 1,
      notes: [
        {
          reference: "3.",
          parts: [
            { text: "Com este título (" },
            { text: "3,11", link: 0 },
            { text: "; " },
            { text: "Jo 1,15", link: 1 },
            { text: ") João pretende (8-9)." },
          ],
        },
      ],
    })
    expect(analytics.track).toHaveBeenCalledWith("footnotes_opened", {
      book: "mat",
      chapter: 11,
      verse: 3,
    })
  })

  // The toolbar's Notas button: the notes of the verses on screen.
  describe("the notes of several verses", () => {
    const withNote = (number: number) =>
      ({
        bookId: "mat",
        chapterNumber: 11,
        number,
        text: [
          { type: "text", text: "…" },
          { type: "footnote", text: "nota", reference: `${number}.` },
        ],
      }) as Verse

    beforeEach(() => bibleRef.extract.and.returnValue([]))

    it("shows them in one sheet, each under its verse", () => {
      const plain = { ...withNote(4), text: [] } as unknown as Verse
      service.openVerses([withNote(3), plain, withNote(5)])

      expect(shown().title).toBe("Mateus 11,3-5")
      expect(shown().notes.map((note) => note.reference)).toEqual(["3.", "5."])
      expect(analytics.track).toHaveBeenCalledWith(
        "footnotes_opened",
        jasmine.objectContaining({ verse: 3, source: "notes-button" }),
      )
    })

    it("titles a single verse as a tap on its asterisk does", () => {
      service.openVerses([withNote(3)])
      expect(shown().title).toBe("Mateus 11,3")
    })

    it("shows nothing for verses without notes", () => {
      service.openVerses([{ ...withNote(3), text: [] } as unknown as Verse])
      expect(nativeChrome.showFootnotes).not.toHaveBeenCalled()
    })
  })

  it("uses the reader's footnote text size", () => {
    fontSize = 125
    service.open([footnote], verse)
    expect(shown().fontScale).toBe(1.25)
  })

  it("titles a psalm's notes with its liturgical number too", () => {
    TestBed.inject(BookService).findBookById = () =>
      ({ id: "psa", shortName: "Salmos" }) as Book
    service.open([footnote], {
      ...verse,
      bookId: "psa",
      chapterNumber: 23,
      number: 1,
    } as Verse)
    expect(shown().title).toBe("Salmo 23 (22),1")
  })

  it("titles notes before the first verse with the chapter alone", () => {
    service.open([footnote], { ...verse, number: 0 } as Verse)
    expect(shown().title).toBe("Mateus 11")
  })

  it("opens a tapped reference at its verses", () => {
    service.open([footnote], verse)
    actions.next({ id: "footnote-link", index: 1 })

    expect(router.navigate).toHaveBeenCalledWith(["/", "url-jhn", 1], {
      queryParams: { verseStart: 15, verseEnd: 18 },
    })
  })

  it("stops listening once the sheet is closed", () => {
    service.open([footnote], verse)
    actions.next({ id: "footnotes-closed" })
    actions.next({ id: "footnote-link", index: 0 })

    expect(router.navigate).not.toHaveBeenCalled()
  })

  // Over another sheet none comes up, and no footnotes-closed would follow.
  it("stops listening when no sheet came up", async () => {
    nativeChrome.showFootnotes.and.resolveTo(false)
    service.open([footnote], verse)
    await new Promise((resolve) => setTimeout(resolve))
    actions.next({ id: "footnote-link", index: 0 })

    expect(router.navigate).not.toHaveBeenCalled()
  })
})
