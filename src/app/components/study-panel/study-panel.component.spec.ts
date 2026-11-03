import { LiveAnnouncer } from "@angular/cdk/a11y"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MatSnackBar,
  type MatSnackBarRef,
  type TextOnlySnackBar,
} from "@angular/material/snack-bar"
import { provideRouter, Router } from "@angular/router"
import { of, Subject, throwError } from "rxjs"
import { BibleApiService } from "../../services/bible-api.service"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { HighlightService } from "../../services/highlight.service"
import { NetworkService } from "../../services/network.service"
import { NotesService } from "../../services/notes.service"
import { OfflineDataService } from "../../services/offline-data.service"
import { OfflineSearchService } from "../../services/offline-search.service"
import {
  type IncomingReference,
  ReverseReferencesService,
} from "../../services/reverse-references.service"
import { StudyModeService } from "../../services/study-mode.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import {
  NOTE_SAVE_DEBOUNCE_MS,
  NOTE_SEARCH_DEBOUNCE_MS,
  type ParallelRequest,
  StudyPanelComponent,
} from "./study-panel.component"

const BOOK: Book = {
  id: "mat",
  name: "Evangelho de São Mateus",
  shortName: "Mateus",
  abrv: "Mt",
  chapterCount: 28,
}

const MARK: Book = {
  id: "mrk",
  name: "Evangelho de São Marcos",
  shortName: "Marcos",
  abrv: "Mc",
  chapterCount: 16,
}

function verse(number: number, text: TextType[]): Verse {
  return {
    bookId: "mat",
    chapterNumber: 22,
    number,
    verseLabel: String(number),
    text,
  }
}

function heading(text: string): Section {
  return { type: "section", tag: "s1", text }
}

/** The title of a division — "PRÓLOGO" — rather than of a passage. */
function majorHeading(text: string): Section {
  return { type: "section", tag: "ms", text }
}

function references(text: string): References {
  return { type: "references", text }
}

function footnote(reference: string, text: string): _Footnote {
  return { type: "footnote", reference, text }
}

function plain(text: string): _Text {
  return { type: "text", text }
}

function paragraph(text: string): Paragraph {
  return { type: "paragraph", text }
}

function reference(
  book: string,
  chapter: number,
  start: number,
  end?: number,
): BibleReference {
  return {
    match: `${book} ${chapter},${start}`,
    index: 0,
    book,
    chapter,
    verses: [
      end ? { type: "range", start, end } : { type: "single", verse: start },
    ],
  }
}

describe("StudyPanelComponent", () => {
  let component: StudyPanelComponent
  let fixture: ComponentFixture<StudyPanelComponent>
  let api: SpyObj<BibleApiService>
  let bibleRef: SpyObj<BibleReferenceService>
  let notes: NotesService

  function setInputs(next: {
    book?: Book
    chapter?: Chapter | null
    selection?: VerseSelection | null
    visibleVerse?: Verse["number"]
    collapsed?: boolean
  }): void {
    // setInput, not a hand-written ngOnChanges: it runs the same input
    // pipeline Angular does and marks this OnPush view dirty, so assertions
    // made after a second call read fresh markup rather than stale.
    for (const [key, value] of Object.entries(next)) {
      fixture.componentRef.setInput(key, value)
    }
    fixture.detectChanges()
  }

  beforeEach(async () => {
    localStorage.removeItem("verseNotes")
    localStorage.removeItem("verseHighlights")

    api = createSpyObj<BibleApiService>("BibleApiService", [
      "getChapter",
      "getVerse",
      "search",
    ])
    api.getChapter.mockReturnValue(
      of({ bookId: "mrk", number: 12, verses: [] }),
    )

    bibleRef = createSpyObj<BibleReferenceService>("BibleReferenceService", [
      "extract",
      "destinationOf",
    ])
    bibleRef.extract.mockReturnValue([])
    bibleRef.destinationOf.mockReturnValue(null)

    const bookService = createSpyObj<BookService>(
      "BookService",
      ["findBook", "getUrlAbrv", "getChapterUrlSegment"],
      { books$: of([BOOK, MARK]) },
    )
    bookService.getChapterUrlSegment.mockImplementation((chapter: number) =>
      String(chapter),
    )
    bookService.findBook.mockImplementation((id: string) =>
      id === "mrk" || id === "Mc" ? MARK : BOOK,
    )
    bookService.getUrlAbrv.mockImplementation((book: Book) =>
      book.abrv.toLowerCase(),
    )

    await TestBed.configureTestingModule({
      imports: [StudyPanelComponent],
      providers: [
        provideRouter([]),
        { provide: BibleApiService, useValue: api },
        { provide: BibleReferenceService, useValue: bibleRef },
        { provide: BookService, useValue: bookService },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(StudyPanelComponent)
    component = fixture.componentInstance
    notes = TestBed.inject(NotesService)
  })

  afterEach(() => {
    localStorage.removeItem("verseNotes")
    localStorage.removeItem("verseHighlights")
  })

  describe("references", () => {
    it("does not list a citation of a book it cannot resolve", () => {
      // findBook answers with the About page for a name it does not know —
      // the orphaned "Rs" a mis-split "2 Rs 25" leaves behind, say.
      const books = TestBed.inject(BookService) as SpyObj<BookService>
      books.findBook.mockImplementation((id: string) =>
        id === "Rs" ? ({ ...BOOK, id: "about" } as Book) : MARK,
      )
      bibleRef.extract.mockReturnValue([
        reference("Rs", 25, 1, 2),
        reference("mrk", 12, 28, 34),
      ])
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [
            verse(34, [plain("Texto"), references("Rs 25,1-2; Mc 12,28-34")]),
          ],
        },
      })

      const labels = component.referenceGroups.flatMap((group) =>
        group.entries.map((entry) => entry.label),
      )
      expect(labels).toEqual(["Marcos 12,28-34"])
      expect(api.getChapter).not.toHaveBeenCalledWith("about", 25)
    })

    it("does not fetch a chapter again to quote from it a second time", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      const chapter = (number: number): Chapter => ({
        bookId: "mat",
        number,
        verses: [verse(1, [plain("Texto"), references("Mc 12,28-34")])],
      })
      setInputs({ book: BOOK, chapter: chapter(22) })
      expect(api.getChapter).toHaveBeenCalledTimes(1)

      // Another chapter citing the same one: back and forth between the two
      // used to refetch Mark 12 every time.
      setInputs({ chapter: chapter(23) })

      expect(api.getChapter).toHaveBeenCalledTimes(1)
      expect(component.referenceGroups[0].entries[0].verses.length).toBe(0)
    })

    it("groups references under the passage they open, not the verse before it", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [
            // The heading and its references arrive in verse 33's payload,
            // but they introduce the passage beginning at verse 34.
            verse(33, [
              plain("E a multidão, ouvindo-o"),
              heading("O mandamento do amor"),
              references("Mc 12,28-34"),
            ]),
            verse(34, [plain("Constando-lhes")]),
            verse(39, [plain("O segundo é semelhante")]),
          ],
        },
      })

      expect(component.referenceGroups.length).toBe(1)
      expect(component.referenceGroups[0].verseNumber).toBe(34)
      expect(component.referenceGroups[0].label).toBe("22,34-39")
      expect(component.referenceGroups[0].entries[0].label).toBe(
        "Marcos 12,28-34",
      )
    })

    it("passes over the range a division prints under its own title", () => {
      // Hebrews 1 opens "PRÓLOGO (1,1-4)" and then "Deus falou-nos por seu
      // Filho": the first parenthesis is the extent of the division, not a
      // passage the text points at. Both arrive as references elements.
      bibleRef.extract.mockImplementation((text: string) =>
        text === "(1,1-4)"
          ? [reference("heb", 1, 1, 4)]
          : text === "(Gn 46,1-27)"
            ? [reference("gen", 46, 1, 27)]
            : [],
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "heb",
          number: 1,
          verses: [
            verse(0, [
              majorHeading("PRÓLOGO"),
              references("(1,1-4)"),
              heading("Deus falou-nos por seu Filho"),
              references("(Gn 46,1-27)"),
            ]),
            verse(1, [plain("Muitas vezes e de muitos modos")]),
          ],
        },
      })

      const entries = component.referenceGroups.flatMap(
        (group) => group.entries,
      )
      // One entry, and it is the passage the second block names.
      expect(entries.length).toBe(1)
      expect(entries[0].chapterNumber).toBe(46)
    })

    it("names both ends of a reference that runs out of its chapter", () => {
      bibleRef.extract.mockReturnValue([
        {
          match: "Mc 1,5-2,52",
          index: 0,
          book: "mrk",
          chapter: 1,
          crossChapter: {
            type: "crossChapterRange",
            startChapter: 1,
            startVerse: 5,
            endChapter: 2,
            endVerse: 52,
          },
        },
      ] as ReturnType<BibleReferenceService["extract"]>)
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 1,
          verses: [verse(1, [plain("Genealogia"), references("Mc 1,5-2,52")])],
        },
      })

      expect(component.referenceGroups[0].entries[0].label).toBe(
        "Marcos 1,5-2,52",
      )
    })

    it("quotes the opening of a reference that runs out of its chapter", () => {
      bibleRef.extract.mockReturnValue([
        {
          match: "Mc 1,5-2,52",
          index: 0,
          book: "mrk",
          chapter: 1,
          crossChapter: {
            type: "crossChapterRange",
            startChapter: 1,
            startVerse: 5,
            endChapter: 2,
            endVerse: 52,
          },
        },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.mockReturnValue(
        of({
          bookId: "mrk",
          number: 1,
          verses: [4, 5, 6, 7, 8].map((number) => ({
            bookId: "mrk",
            chapterNumber: 1,
            number,
            verseLabel: String(number),
            text: [plain(`verso ${number}`)],
          })),
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 1,
          verses: [verse(1, [plain("Genealogia"), references("Mc 1,5-2,52")])],
        },
      })

      const entry = component.referenceGroups[0].entries[0]
      // Its opening verses, like any long passage — not the single verse it
      // starts on — and the way on to the rest of it.
      expect(entry.verses.map((quoted) => quoted.number)).toEqual([5, 6, 7])
      expect(entry.truncated).toBe(true)
    })

    it("keeps the references printed after that range", () => {
      // Matthew heads its first division "(1,1-2,23; ver Lc 1,5-2,52)": the
      // division's own extent, and then the gospel to read beside it. Only
      // the extent is the heading's own.
      bibleRef.extract.mockReturnValue([
        {
          match: "1,1-2,23",
          index: 0,
          book: "mat",
          chapter: 1,
          crossChapter: {
            type: "crossChapterRange",
            startChapter: 1,
            startVerse: 1,
            endChapter: 2,
            endVerse: 23,
          },
        },
        reference("mrk", 1, 5, 52),
      ] as ReturnType<BibleReferenceService["extract"]>)
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 1,
          verses: [
            verse(0, [
              majorHeading("I. EVANGELHO DA INFÂNCIA DE JESUS"),
              references("(1,1-2,23; ver Mc 1,5-2,52)"),
            ]),
            verse(1, [plain("Genealogia de Jesus Cristo")]),
          ],
        },
      })

      const entries = component.referenceGroups.flatMap(
        (group) => group.entries,
      )
      expect(entries.length).toBe(1)
      expect(entries[0].bookId).toBe("mrk")
      // And it is headed by the division's own range, not by the passage that
      // happens to start on the same verse: the parallel gospel is a parallel
      // to the whole of "I. EVANGELHO DA INFÂNCIA DE JESUS".
      expect(component.referenceGroups[0].label).toBe("1,1-2,23")
    })

    it("ends a passage where the next heading begins", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [
            verse(33, [
              plain("E a multidão"),
              heading("O mandamento do amor"),
              references("Mc 12,28-34"),
            ]),
            verse(34, [plain("Constando-lhes")]),
            verse(40, [plain("Destes dois"), heading("O Messias")]),
            verse(41, [plain("Estando os fariseus")]),
          ],
        },
      })

      expect(component.referenceGroups[0].label).toBe("22,34-40")
      expect(component.referenceGroups[0].lastVerse).toBe(40)
    })

    it("names the passage a chapter's opening parallels cover", () => {
      bibleRef.extract.mockReturnValue([reference("luk", 14, 15, 24)])
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [
            // Verse 0 is the front matter: the heading and the references
            // under it arrive here, ahead of the verse they introduce.
            verse(0, [
              heading("Parábola do grande banquete"),
              references("Lc 14,15-24"),
            ]),
            verse(1, [plain("Tendo Jesus recomeçado")]),
            verse(2, [plain("O Reino do Céu")]),
          ],
        },
      })

      // They belong to the passage that heading opens, which runs from the
      // first verse to the end of the chapter — not to verse 0.
      expect(component.referenceGroups[0].verseNumber).toBe(1)
      expect(component.referenceGroups[0].label).toBe("22,1-2")
    })

    it("shows a reference once even when the verse prints it twice", () => {
      bibleRef.extract.mockReturnValue([
        reference("mrk", 12, 31),
        reference("mrk", 12, 31),
      ])
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(39, [references("Mc 12,31"), references("Mc 12,31")])],
        },
      })

      expect(component.referenceGroups[0].entries.length).toBe(1)
    })

    it("fetches one chapter for references that share it", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "a" ? [reference("mrk", 12, 28)] : [reference("mrk", 12, 31)],
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("a")]), verse(39, [references("b")])],
        },
      })

      expect(api.getChapter).toHaveBeenCalledTimes(1)
      expect(api.getChapter).toHaveBeenCalledWith("mrk", 12)
    })

    it("quotes up to three verses of a passage and offers the rest as a link", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 28, 34)])
      api.getChapter.mockReturnValue(
        of({
          bookId: "mrk",
          number: 12,
          verses: [28, 29, 30, 31, 32, 33, 34].map((number) => ({
            bookId: "mrk",
            chapterNumber: 12,
            number,
            verseLabel: String(number),
            text: [plain(`verso ${number}`)],
          })),
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Mc 12,28-34")])],
        },
      })

      const entry = component.referenceGroups[0].entries[0]
      expect(entry.verses.map((v) => v.number)).toEqual([28, 29, 30])
      expect(entry.truncated).toBe(true)
      expect(
        fixture.nativeElement.querySelector(".reference-more"),
      ).toBeTruthy()
    })

    it("does not mark a short passage as running on", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 30, 31)])
      api.getChapter.mockReturnValue(
        of({
          bookId: "mrk",
          number: 12,
          verses: [30, 31].map((number) => ({
            bookId: "mrk",
            chapterNumber: 12,
            number,
            verseLabel: String(number),
            text: [plain(`verso ${number}`)],
          })),
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(39, [references("Mc 12,30-31")])],
        },
      })

      const entry = component.referenceGroups[0].entries[0]
      expect(entry.verses.length).toBe(2)
      expect(entry.truncated).toBeFalsy()
      // The link on to the rest of the passage, specifically: the button that
      // opens it beside the chapter is offered on every reference.
      expect(fixture.nativeElement.querySelector("a.reference-more")).toBeNull()
    })

    it("links the passage even when its text cannot be fetched", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 31)])
      api.getChapter.mockReturnValue(throwError(() => new Error("offline")))
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(39, [references("Mc 12,31")])],
        },
      })

      const link = fixture.nativeElement.querySelector(".reference-label")
      expect(link.getAttribute("href")).toBe("/mc/12?verseStart=31")
    })

    it("shows the referenced verse's own words, without its apparatus", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 31)])
      api.getChapter.mockReturnValue(
        of({
          bookId: "mrk",
          number: 12,
          verses: [
            {
              bookId: "mrk",
              chapterNumber: 12,
              number: 31,
              verseLabel: "31",
              text: [
                {
                  type: "section",
                  tag: "s1",
                  text: "Título",
                },
                plain("Não há mandamento maior do que estes."),
                footnote("12, 31", "uma nota"),
              ],
            },
          ],
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(39, [references("Mc 12,31")])],
        },
      })

      expect(component.referenceGroups[0].entries[0].verses).toEqual([
        {
          number: 31,
          lines: [
            [{ text: "Não há mandamento maior do que estes.", allCaps: false }],
          ],
          breakBefore: false,
        },
      ])
    })

    it("quotes the opening of a chapter cited whole", () => {
      // "Jb 38" names a chapter, not a verse in it.
      bibleRef.extract.mockReturnValue([
        { match: "Jb 38", index: 0, book: "job", chapter: 38 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.mockReturnValue(
        of({
          bookId: "job",
          number: 38,
          verses: [
            // The front matter carries the heading, not words to quote.
            {
              bookId: "job",
              chapterNumber: 38,
              number: 0,
              verseLabel: "front",
              text: [plain("Discurso do Senhor")],
            },
            ...[1, 2, 3, 4].map((number) => ({
              bookId: "job",
              chapterNumber: 38,
              number,
              verseLabel: String(number),
              text: [plain(`verso ${number}`)],
            })),
          ],
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Jb 38")])],
        },
      })

      const entry = component.referenceGroups[0].entries[0]
      expect(entry.verses.map((v) => v.number)).toEqual([1, 2, 3])
      expect(entry.truncated).toBe(true)
    })

    it("does not open a quoted psalm on an invisible character", () => {
      bibleRef.extract.mockReturnValue([
        { match: "Sl 8", index: 0, book: "psa", chapter: 8 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.mockReturnValue(
        of({
          bookId: "psa",
          number: 8,
          verses: [
            {
              bookId: "psa",
              chapterNumber: 8,
              number: 1,
              verseLabel: "1",
              // Poetry opens on a zero-width space, which trim() keeps.
              text: [
                { type: "quote", text: "\u200b" },
                plain("Ao diretor do coro."),
              ] as TextType[],
            },
          ],
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Sl 8")])],
        },
      })

      expect(component.referenceGroups[0].entries[0].verses[0].lines).toEqual([
        [{ text: "Ao diretor do coro.", allCaps: false }],
      ])
    })

    it("sets a quoted psalm in its own lines, with the divine name in caps", () => {
      bibleRef.extract.mockReturnValue([
        { match: "Sl 104", index: 0, book: "psa", chapter: 104 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.mockReturnValue(
        of({
          bookId: "psa",
          number: 104,
          verses: [
            {
              bookId: "psa",
              chapterNumber: 104,
              number: 1,
              verseLabel: "1",
              text: [
                { type: "quote", text: "\u200b" },
                {
                  type: "text",
                  text: "Bendiz, ó minha alma, o ",
                },
                {
                  type: "text",
                  text: "Senhor",
                  allCaps: true,
                },
                { type: "text", text: "!" },
                {
                  type: "quote",
                  text: "Estás revestido de esplendor",
                },
              ] as TextType[],
            },
          ],
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Sl 104")])],
        },
      })

      const [preview] = component.referenceGroups[0].entries[0].verses
      // Two lines, not one paragraph — and the spacing the edition prints,
      // rather than "o Senhor !" from trimming each run and rejoining.
      expect(preview.lines.length).toBe(2)
      expect(preview.lines[0].map((run) => run.text).join("")).toBe(
        "Bendiz, ó minha alma, o Senhor!",
      )
      expect(preview.lines[0].some((run) => run.allCaps)).toBe(true)
      expect(preview.lines[1][0].text).toBe("Estás revestido de esplendor")
    })

    it("breaks where the edition does, on a paragraph as well as a quote", () => {
      // Hebrews 1,5 is a line of prose and then the scripture it quotes, set
      // by this edition as a paragraph. Run together it reads "disse Deus
      // alguma vez:Tu és meu Filho".
      bibleRef.extract.mockReturnValue([
        { match: "Hb 1,5", index: 0, book: "heb", chapter: 1 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.mockReturnValue(
        of({
          bookId: "heb",
          number: 1,
          verses: [
            {
              bookId: "heb",
              chapterNumber: 1,
              number: 5,
              verseLabel: "5",
              text: [
                footnote("a", "uma nota"),
                plain("Com efeito, a qual dos anjos disse Deus alguma vez:"),
                paragraph("Tu és meu Filho, Eu hoje te gerei?"),
                // The paragraph that closes a verse carries a newline and
                // nothing else, and must not leave an empty line behind.
                paragraph("\n"),
              ] as TextType[],
            },
          ],
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Hb 1,5")])],
        },
      })

      const [preview] = component.referenceGroups[0].entries[0].verses
      expect(preview.lines.length).toBe(2)
      expect(preview.lines[0].map((run) => run.text).join("")).toBe(
        "Com efeito, a qual dos anjos disse Deus alguma vez:",
      )
      expect(preview.lines[1][0].text).toBe(
        "Tu és meu Filho, Eu hoje te gerei?",
      )
    })

    it("gives each verse of a quoted psalm its own line", () => {
      bibleRef.extract.mockReturnValue([
        { match: "Sl 104", index: 0, book: "psa", chapter: 104 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      const poetry = (number: number) => ({
        bookId: "psa",
        chapterNumber: 104,
        number,
        verseLabel: String(number),
        text: [{ type: "quote", text: `linha ${number}` }] as TextType[],
      })
      api.getChapter.mockReturnValue(
        of({ bookId: "psa", number: 104, verses: [poetry(1), poetry(2)] }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Sl 104")])],
        },
      })

      const [first, second] = component.referenceGroups[0].entries[0].verses
      expect(first.breakBefore).toBe(false)
      // Otherwise verse 2's number runs straight into the end of verse 1.
      expect(second.breakBefore).toBe(true)
    })

    it("lets prose verses run on, as the chapter does", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 30, 31)])
      const prose = (number: number) => ({
        bookId: "mrk",
        chapterNumber: 12,
        number,
        verseLabel: String(number),
        text: [plain(`verso ${number}`)],
      })
      api.getChapter.mockReturnValue(
        of({ bookId: "mrk", number: 12, verses: [prose(30), prose(31)] }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Mc 12,30-31")])],
        },
      })

      const verses = component.referenceGroups[0].entries[0].verses
      expect(verses.every((v) => !v.breakBefore)).toBe(true)
    })

    it("names both ends of a run of whole chapters", () => {
      bibleRef.extract.mockReturnValue([
        {
          match: "Jb 38-39",
          index: 0,
          book: "job",
          chapter: 38,
          endChapter: 39,
        },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.mockReturnValue(
        of({
          bookId: "job",
          number: 38,
          verses: [
            {
              bookId: "job",
              chapterNumber: 38,
              number: 1,
              verseLabel: "1",
              text: [plain("Então, do seio da tempestade")],
            },
          ],
        }),
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(34, [references("Jb 38-39")])],
        },
      })

      const entry = component.referenceGroups[0].entries[0]
      // Job, not the About page: the book has to resolve for this to mean
      // anything, and the label says how far the run goes.
      expect(entry.label).toBe("Mateus 38-39")
      expect(entry.queryParams).toBeNull()
      // Its opening verses stand for it, as for any chapter cited whole.
      expect(entry.verses.length).toBe(1)
    })

    it("keeps a reference as a link when its text cannot be fetched", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 31)])
      api.getChapter.mockReturnValue(throwError(() => new Error("offline")))
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(39, [references("Mc 12,31")])],
        },
      })

      const entry = component.referenceGroups[0].entries[0]
      expect(entry.failed).toBe(true)
      expect(entry.link).toEqual(["/", "mc", 12])
    })

    it("does not refetch when the reader only selects a verse", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 31)])
      const chapter: Chapter = {
        bookId: "mat",
        number: 22,
        verses: [verse(39, [references("Mc 12,31")])],
      }
      setInputs({ book: BOOK, chapter })
      api.getChapter.mockClear()

      setInputs({ selection: { verse: chapter.verses?.[0] as Verse } })

      expect(api.getChapter).not.toHaveBeenCalled()
    })

    it("keeps the passage's references marked for every verse in it", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      const chapter: Chapter = {
        bookId: "mat",
        number: 22,
        verses: [
          // The heading and the references sit on the verse that opens the
          // passage; the rest of it carries neither.
          verse(34, [
            {
              type: "section",
              tag: "s1",
              text: "O mandamento do amor",
            },
            references("Mc 12,28-34"),
            plain("Constando-lhes"),
          ]),
          verse(39, [plain("O segundo é semelhante")]),
          verse(40, [plain("Destes dois mandamentos")]),
          verse(41, [
            {
              type: "section",
              tag: "s1",
              text: "O Messias",
            },
            plain("Estando os fariseus reunidos"),
          ]),
        ],
      }
      setInputs({ book: BOOK, chapter })

      const group = component.referenceGroups[0]
      expect(group.lastVerse).toBe(40)

      // The verse carrying them, a verse in the middle, and the last verse
      // of the passage all keep the group marked.
      for (const number of [34, 39, 40]) {
        setInputs({
          selection: {
            verse: chapter.verses?.find((v) => v.number === number) as Verse,
          },
        })
        expect(component.isCurrentGroup(group), `verse ${number}`).toBe(true)
      }

      // The next passage is not this one.
      setInputs({
        selection: {
          verse: chapter.verses?.find((v) => v.number === 41) as Verse,
        },
      })
      expect(component.isCurrentGroup(group)).toBe(false)
    })

    it("follows the verse on screen without marking it", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [
            verse(34, [references("Mc 12,28-34"), plain("Constando-lhes")]),
            verse(39, [plain("O segundo é semelhante")]),
          ],
        },
      })

      setInputs({ visibleVerse: 39 })
      fixture.detectChanges()

      // The panel follows the reader down the chapter...
      expect(component.activeVerse).toBe(39)
      // ...but scrolling past a verse is not choosing it, so nothing is
      // marked until the reader actually picks one.
      expect(component.isCurrentGroup(component.referenceGroups[0])).toBe(false)
      expect(
        fixture.nativeElement.querySelector(".reference-group.current"),
      ).toBeNull()
    })

    it("marks the passage once the reader picks a verse in it", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      const chapter: Chapter = {
        bookId: "mat",
        number: 22,
        verses: [
          verse(34, [references("Mc 12,28-34"), plain("Constando-lhes")]),
          verse(39, [plain("O segundo é semelhante")]),
        ],
      }
      setInputs({ book: BOOK, chapter, visibleVerse: 39 })

      setInputs({
        selection: { verse: chapter.verses?.[1] as Verse },
      })
      fixture.detectChanges()

      expect(component.isCurrentGroup(component.referenceGroups[0])).toBe(true)
      expect(
        fixture.nativeElement.querySelector(".reference-group.current"),
      ).toBeTruthy()
    })

    it("stops marking when the reader lets the verse go", () => {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      const chapter: Chapter = {
        bookId: "mat",
        number: 22,
        verses: [verse(34, [references("Mc 12,28-34"), plain("Constando")])],
      }
      setInputs({
        book: BOOK,
        chapter,
        selection: { verse: chapter.verses?.[0] as Verse },
      })
      expect(component.isCurrentGroup(component.referenceGroups[0])).toBe(true)

      setInputs({ selection: null, visibleVerse: 34 })

      expect(component.isCurrentGroup(component.referenceGroups[0])).toBe(false)
    })

    it("lets a chosen verse outrank the one on screen", () => {
      bibleRef.extract.mockReturnValue([])
      const chosen = verse(12, [plain("escolhido")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [chosen] },
        selection: { verse: chosen },
        visibleVerse: 39,
      })

      expect(component.activeVerse).toBe(12)
    })

    it("goes back to following the screen once the verse is let go", () => {
      bibleRef.extract.mockReturnValue([])
      const chosen = verse(12, [plain("escolhido")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [chosen] },
        selection: { verse: chosen },
        visibleVerse: 39,
      })

      setInputs({ selection: null })

      expect(component.activeVerse).toBe(39)
    })

    it("stops following once the reader scrolls the panel themselves", async () => {
      vi.useFakeTimers()
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 31)])
      const first = verse(34, [references("Mc 12,28")])
      const second = verse(39, [references("Mc 12,31")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [first, second] },
        visibleVerse: 34,
      })
      await vi.advanceTimersByTimeAsync(50)
      const follow = vi.spyOn(
        component as unknown as { scrollActiveIntoView: () => void },
        "scrollActiveIntoView",
      )

      // They are reading something in the panel; the text scrolling on under
      // their other hand must not take it away from them.
      fixture.nativeElement
        .querySelector(".tab-body")
        .dispatchEvent(new Event("wheel"))
      setInputs({ visibleVerse: 39 })
      expect(follow).not.toHaveBeenCalled()

      // Picking a verse is asking the panel to look somewhere: it follows.
      setInputs({ selection: { verse: second } })
      expect(follow).toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(50)
    })

    it("marks the selected verse's group as the current one", () => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 31)])
      const target = verse(39, [references("Mc 12,31")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      expect(
        fixture.nativeElement.querySelector(".reference-group.current"),
      ).toBeTruthy()
    })
  })

  describe("opening a reference beside the chapter", () => {
    function openFirstReference(): ParallelRequest[] {
      bibleRef.extract.mockImplementation((text: string) =>
        text === "Mc 12,28-34" ? [reference("mrk", 12, 28, 34)] : [],
      )
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [
            verse(33, [plain("E a multidão"), references("Mc 12,28-34")]),
            verse(34, [plain("Constando-lhes")]),
          ],
        },
      })

      const asked: ParallelRequest[] = []
      component.openBeside.subscribe((request) => asked.push(request))
      const button = fixture.nativeElement.querySelector(
        "button.reference-more",
      ) as HTMLButtonElement
      button.click()
      return asked
    }

    it("asks for the passage the reference names", () => {
      const asked = openFirstReference()

      expect(asked.length).toBe(1)
      expect(asked[0]).toEqual(
        expect.objectContaining({
          label: "Marcos 12,28-34",
          bookId: "mrk",
          chapterNumber: 12,
          verseStart: 28,
          verseEnd: 34,
        }),
      )
    })

    it("offers it on every reference, not only the ones cut short", () => {
      // The preview here is the whole passage, so there is no "read it all"
      // link — the parallel is still the point of looking the reference up.
      const asked = openFirstReference()

      expect(asked.length).toBe(1)
      expect(
        fixture.nativeElement.querySelectorAll("button.reference-more").length,
      ).toBe(1)
    })
  })

  describe("footnotes", () => {
    it("lists the whole chapter's footnotes, not just the selected verse's", () => {
      const target = verse(2, [footnote("22, 2", "primeira nota")])
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [target, verse(11, [footnote("22, 11", "segunda nota")])],
        },
        selection: { verse: target },
      })

      expect(component.footnotes.map((entry) => entry.verseNumber)).toEqual([
        2, 11,
      ])
    })

    it("opens on the footnotes when the marker asked for them", () => {
      const target = verse(2, [footnote("22, 2", "uma nota")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target, panel: "footnotes" },
      })

      expect(component.activeTab).toBe("footnotes")
    })

    it("renders the newly chosen tab without waiting for another pass", () => {
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })

      // No detectChanges() after the click: switching tabs has to paint on
      // its own, since nothing else follows the click to flush a pass.
      fixture.nativeElement
        .querySelectorAll(".tab")[1]
        .dispatchEvent(new MouseEvent("click"))

      const active = fixture.nativeElement.querySelector(".tab.active")
      // Short on the strip, so it fits on one line; whole to a screen reader,
      // and the one contains the other so voice control finds it either way.
      expect(active.textContent.trim()).toBe("Rodapé")
      expect(active.getAttribute("aria-label")).toBe("Notas de rodapé")
      expect(fixture.nativeElement.querySelector(".tab-body").id).toBe(
        "study-tabpanel-footnotes",
      )
    })

    it("leaves the reader on the tab they were reading otherwise", () => {
      component.selectTab("notes")
      const target = verse(2, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      expect(component.activeTab).toBe("notes")
    })
  })

  describe("folding away", () => {
    it("keeps only the unfold button when it is folded", () => {
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })
      fixture.componentRef.setInput("collapsed", true)
      fixture.detectChanges()

      expect(fixture.nativeElement.querySelector(".tab-strip")).toBeNull()
      const toggle = fixture.nativeElement.querySelector(".collapse-toggle")
      expect(toggle.getAttribute("aria-expanded")).toBe("false")
      expect(toggle.getAttribute("aria-label")).toBe(
        "Mostrar referências e notas",
      )
    })

    it("asks to be folded when the button is pressed", () => {
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })
      let asked = 0
      component.toggleCollapsed.subscribe(() => asked++)

      fixture.nativeElement
        .querySelector(".collapse-toggle")
        .dispatchEvent(new MouseEvent("click"))

      expect(asked).toBe(1)
    })
  })

  describe("following the reader without lurching", () => {
    // A 400px-tall panel, entries 60px tall, 16px margin.
    const view = 400
    const height = 60

    it("stays put when the entry is already comfortably in view", () => {
      expect(
        StudyPanelComponent.scrollTargetFor(0, view, 100, height),
      ).toBeNull()
    })

    it("moves the least it can when the entry is just below the fold", () => {
      // Bottom at 420 in a 400 view: lift it by 36 (20 past the edge, plus
      // the margin), not all the way to the top.
      expect(StudyPanelComponent.scrollTargetFor(0, view, 360, height)).toBe(36)
    })

    it("brings an entry above the fold back to the top edge", () => {
      expect(StudyPanelComponent.scrollTargetFor(500, view, 300, height)).toBe(
        284,
      )
    })

    it("top-aligns an entry too tall to fit", () => {
      expect(StudyPanelComponent.scrollTargetFor(0, view, 500, 800)).toBe(484)
    })

    it("never scrolls above the top of the panel", () => {
      expect(StudyPanelComponent.scrollTargetFor(50, view, 4, height)).toBe(0)
    })

    it("counts the margin as out of view, so nothing sits on the edge", () => {
      // Flush with the top edge: technically visible, but hard against it.
      expect(StudyPanelComponent.scrollTargetFor(0, view, 4, height)).toBe(0)
    })
  })

  describe("marking and copying a verse", () => {
    function selectVerse(): Verse {
      const target = verse(37, [plain("Amarás ao Senhor")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })
      return target
    }

    it("marks the selected verse with the colour chosen", () => {
      selectVerse()

      component.toggleHighlight("green")

      expect(TestBed.inject(HighlightService).colorFor("mat", 22, 37)).toBe(
        "green",
      )
      expect(component.selectedHighlight).toBe("green")
    })

    it("takes the mark off when the same colour is chosen again", () => {
      selectVerse()

      component.toggleHighlight("green")
      component.toggleHighlight("green")

      expect(component.selectedHighlight).toBeUndefined()
    })

    it("copies the verse with its reference", async () => {
      const written: string[] = []
      vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
        (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      )
      selectVerse()

      await component.copySelectedVerse()

      expect(written).toEqual(["Amarás ao Senhor (Mateus 22,37)"])
      expect(component.copied).toBe(true)
    })

    it("says nothing when the clipboard refuses", async () => {
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
        new Error("denied"),
      )
      selectVerse()

      await component.copySelectedVerse()

      // The verse is still on screen to select by hand; an error thrown over
      // the text would help nobody.
      expect(component.copied).toBe(false)
    })
  })

  describe("opened from the keyboard", () => {
    beforeEach(() => document.body.appendChild(fixture.nativeElement))
    afterEach(() => fixture.nativeElement.remove())

    it("puts the caret in the search box, not just the tab on screen", () => {
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })

      component.openTab("search", true)

      expect(component.activeTab).toBe("search")
      expect(document.activeElement?.id).toBe("study-search")
    })

    it("puts it in the note box of the selected verse", () => {
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      component.openTab("notes", true)

      expect(document.activeElement?.id).toBe("study-note-tab")
    })

    it("only shows a tab that has nowhere to type", () => {
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })
      component.openTab("search")

      component.openTab("footnotes", true)

      expect(component.activeTab).toBe("footnotes")
    })
  })

  describe("searching for a reference", () => {
    let router: Router

    beforeEach(() => {
      router = TestBed.inject(Router)
      vi.spyOn(router, "navigate").mockResolvedValue(true)
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })
    })

    it("goes to the passage instead of searching for its digits", () => {
      bibleRef.destinationOf.mockReturnValue({
        book: MARK,
        chapter: 12,
        verseStart: 31,
      })
      api.getVerse.mockReturnValue(of(verse(31, [])))

      component.onSearchSubmit("Mc 12,31")

      expect(api.search).not.toHaveBeenCalled()
      expect(router.navigate).toHaveBeenCalledExactlyOnceWith(
        ["/", "mc", "12"],
        {
          queryParams: { verseStart: 31 },
        },
      )
    })

    it("says aloud what a search found", () => {
      const announce = vi
        .spyOn(TestBed.inject(LiveAnnouncer), "announce")
        .mockResolvedValue(undefined)
      api.search.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )

      component.onSearchSubmit("amarás")

      // On screen "A procurar…" is simply replaced, which says nothing to a
      // reader who cannot see it.
      expect(announce).toHaveBeenCalledExactlyOnceWith(
        "Nada encontrado para amarás.",
      )
    })

    it("says aloud where a reference opened, since nothing else changes", () => {
      const announce = vi
        .spyOn(TestBed.inject(LiveAnnouncer), "announce")
        .mockResolvedValue(undefined)
      bibleRef.destinationOf.mockReturnValue({
        book: MARK,
        chapter: 12,
        verseStart: 31,
      })
      api.getVerse.mockReturnValue(of(verse(31, [])))

      component.onSearchSubmit("Mc 12,31")

      expect(announce).toHaveBeenCalledWith(`${MARK.shortName} 12,31 aberto.`)
    })

    it("offers both psalms a leaflet's number may mean, rather than guessing", () => {
      const psalms = { ...BOOK, id: "psa", abrv: "Sl", shortName: "Salmos" }
      bibleRef.destinationOf.mockReturnValue({ book: psalms, chapter: 94 })
      const announce = vi
        .spyOn(TestBed.inject(LiveAnnouncer), "announce")
        .mockResolvedValue(undefined)
      component.openTab("search")

      component.onSearchSubmit("Sl 94")
      fixture.detectChanges()

      expect(router.navigate).not.toHaveBeenCalled()
      const links = Array.from<Element>(
        fixture.nativeElement.querySelectorAll(
          "#study-tabpanel-search .reference-label",
        ),
      ).map((link) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute("href"),
      }))
      expect(links).toEqual([
        { text: "Salmo 94 (93)", href: "/sl/94" },
        { text: "Salmo 95 (94)", href: "/sl/95" },
      ])
      expect(announce).toHaveBeenCalledWith(
        "Qual salmo procura? Salmo 94 (93), nesta Bíblia; Salmo 95 (94), como na Missa.",
      )
    })

    it("says so when the reference names a verse that is not there", () => {
      bibleRef.destinationOf.mockReturnValue({ book: MARK, chapter: 40 })
      api.getVerse.mockReturnValue(throwError(() => ({ status: 404 })))

      component.onSearchSubmit("Mc 40")

      expect(router.navigate).not.toHaveBeenCalled()
      expect(component.searchState).toBe("missing")
    })

    it("still searches the text for anything else", () => {
      api.search.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )

      component.onSearchSubmit("amarás")

      expect(api.search).toHaveBeenCalled()
      expect(router.navigate).not.toHaveBeenCalled()
    })
  })

  describe("searching with no connection", () => {
    beforeEach(() => {
      vi.spyOn(
        TestBed.inject(NetworkService),
        "isOffline",
        "get",
      ).mockReturnValue(true)
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })
    })

    it("looks in the Bible kept on the device rather than refusing", async () => {
      vi.spyOn(
        TestBed.inject(OfflineSearchService),
        "search",
      ).mockResolvedValue([verse(37, [plain("Amarás o Senhor")])])

      component.onSearchSubmit("amarás")

      await vi.waitFor(() => expect(component.searchState).toBe("done"))
      expect(api.search).not.toHaveBeenCalled()
      expect(component.searchResults).toHaveLength(1)
    })

    it("says so when no Bible is kept on the device", async () => {
      vi.spyOn(
        TestBed.inject(OfflineSearchService),
        "search",
      ).mockResolvedValue(null)

      component.onSearchSubmit("amarás")

      await vi.waitFor(() =>
        expect(component.searchState).toBe("nothingStored"),
      )
      expect(component.searchResults).toEqual([])
    })
  })

  describe("the follow-along scroll", () => {
    let body: HTMLElement

    beforeEach(() => {
      body = document.createElement("div")
      body.style.cssText = "height:100px;overflow:auto"
      const content = document.createElement("div")
      content.style.height = "4000px"
      body.appendChild(content)
      document.body.appendChild(body)
    })

    afterEach(() => body.remove())

    it("arrives where it was sent", async () => {
      vi.useFakeTimers()
      component["glideTo"](body, 600)
      await vi.advanceTimersByTimeAsync(2000)

      expect(body.scrollTop).toBe(600)
      expect(component["glide"]).toBeUndefined()
    })

    it("lets go the moment the reader scrolls the panel themselves", async () => {
      vi.useFakeTimers()
      component["glideTo"](body, 2000)
      await vi.advanceTimersByTimeAsync(100)
      const taken = body.scrollTop
      expect(taken).toBeGreaterThan(0)
      expect(taken).toBeLessThan(2000)

      body.dispatchEvent(new Event("wheel"))
      await vi.advanceTimersByTimeAsync(2000)

      // It used to write its own position back on every frame until it had
      // finished, whatever the reader did in the meantime.
      expect(body.scrollTop).toBe(taken)
    })

    it("keeps following when the reader presses one of the panel's controls", async () => {
      vi.useFakeTimers()
      // "Abrir ao lado", "Copiar", a colour: pressing one is not scrolling the
      // panel, and it used to freeze it on the passage it was showing.
      const button = document.createElement("button")
      body.appendChild(button)
      component["glideTo"](body, 2000)
      await vi.advanceTimersByTimeAsync(100)

      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      await vi.advanceTimersByTimeAsync(3000)

      expect(component["readerHoldsPanel"]).toBe(false)
      expect(body.scrollTop).toBe(2000)
    })

    it("still lets go on a press on the panel's text", async () => {
      vi.useFakeTimers()
      component["glideTo"](body, 2000)
      await vi.advanceTimersByTimeAsync(100)

      body.firstElementChild?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      )

      expect(component["readerHoldsPanel"]).toBe(true)
    })

    it("bends towards a new target without stopping first", async () => {
      vi.useFakeTimers()
      component["glideTo"](body, 2000)
      await vi.advanceTimersByTimeAsync(150)
      const speed = component["glide"]?.velocity ?? 0
      expect(speed).toBeGreaterThan(0)

      // The reading position moved on: same glide, new destination.
      component["glideTo"](body, 2400)

      expect(component["glide"]?.velocity).toBe(speed)
      await vi.advanceTimersByTimeAsync(3000)
      expect(body.scrollTop).toBe(2400)
    })
  })

  describe("what cites this verse", () => {
    it("offers to look rather than indexing the corpus unasked", () => {
      const reverse = TestBed.inject(ReverseReferencesService)
      const build = vi.spyOn(reverse, "ensureIndex").mockResolvedValue()
      const target = verse(37, [plain("Amarás ao Senhor")])

      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      expect(build).not.toHaveBeenCalled()
      expect(component.incomingState).toBe("idle")
    })

    it("builds the index only when the reader asks", async () => {
      const reverse = TestBed.inject(ReverseReferencesService)
      const build = vi.spyOn(reverse, "ensureIndex").mockResolvedValue()
      const target = verse(37, [plain("Amarás ao Senhor")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      await component.showIncoming()

      expect(build).toHaveBeenCalled()
    })
  })

  describe("what cites this verse, without the offline text", () => {
    const target = verse(37, [plain("Amarás ao Senhor")])
    let reverse: ReverseReferencesService
    let offlineData: OfflineDataService

    const choose = (): void =>
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })
    const action = (): HTMLButtonElement | null =>
      fixture.nativeElement.querySelector(".incoming .verse-action")
    const incomingText = (): string =>
      (fixture.nativeElement.querySelector(".incoming")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()

    beforeEach(() => {
      reverse = TestBed.inject(ReverseReferencesService)
      offlineData = TestBed.inject(OfflineDataService)
      vi.spyOn(reverse, "state", "get").mockReturnValue("unavailable")
      vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: false,
      } as MediaQueryList)
    })

    it("says what it needs and how much it is, and offers to fetch it", () => {
      choose()

      expect(incomingText()).toContain(
        "Precisa da Bíblia guardada neste dispositivo (cerca de 5 MB).",
      )
      expect(action()?.textContent).toContain("Descarregar o texto")
    })

    it("fetches the Bible when asked, and then looks", async () => {
      const preload = vi
        .spyOn(offlineData, "preloadAllBooksAndChapters")
        .mockResolvedValue()
      vi.spyOn(offlineData, "isBibleStored").mockReturnValue(true)
      const build = vi.spyOn(reverse, "ensureIndex").mockResolvedValue()
      choose()

      action()?.click()
      await fixture.whenStable()

      expect(preload).toHaveBeenCalledExactlyOnceWith("study")
      expect(build).toHaveBeenCalled()
    })

    it("does not go on to look when the fetch did not store anything", async () => {
      vi.spyOn(offlineData, "preloadAllBooksAndChapters").mockResolvedValue()
      vi.spyOn(offlineData, "isBibleStored").mockReturnValue(false)
      const build = vi.spyOn(reverse, "ensureIndex").mockResolvedValue()
      choose()

      await component.downloadText()

      expect(build).not.toHaveBeenCalled()
      expect(component.downloading).toBe(false)
    })

    it("fetches nothing without a connection, and says to try again", () => {
      vi.spyOn(
        TestBed.inject(NetworkService),
        "isOffline",
        "get",
      ).mockReturnValue(true)
      TestBed.inject(NetworkService).isOffline$.subscribe()
      component.offline = true
      choose()
      fixture.detectChanges()

      expect(action()).toBeNull()
      expect(incomingText()).toContain("Sem ligação")
    })

    it("in the installed app only asks again, since the app fetches it by itself", async () => {
      vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: true,
      } as MediaQueryList)
      const build = vi.spyOn(reverse, "ensureIndex").mockResolvedValue()
      choose()

      expect(action()?.textContent).toContain("Procurar de novo")

      action()?.click()
      await fixture.whenStable()
      expect(build).toHaveBeenCalled()
    })
  })

  describe("what cites this verse, with the text stored", () => {
    const target = verse(37, [plain("Amarás ao Senhor")])
    let reverse: ReverseReferencesService

    const citation = (
      overrides: Partial<IncomingReference> = {},
    ): IncomingReference => ({
      key: "a",
      label: "Marcos 12,31",
      link: ["/", "mc", "12"],
      queryParams: { verseStart: 31 },
      fromVerse: 37,
      toVerse: 37,
      source: "referência",
      excerpt: "Amarás o teu próximo como a ti mesmo",
      ...overrides,
    })

    beforeEach(() => {
      reverse = TestBed.inject(ReverseReferencesService)
      vi.spyOn(reverse, "state", "get").mockReturnValue("ready")
      vi.spyOn(reverse, "incomingFor").mockReturnValue([
        citation(),
        citation({
          key: "b",
          label: "Lucas 10,27",
          source: "nota",
          excerpt: "",
        }),
      ])
      vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: false,
      } as MediaQueryList)
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })
    })

    it("says where each citation is printed, and quotes the citing verse", () => {
      const part = (row: Element, selector: string): string | undefined =>
        row.querySelector(selector)?.textContent?.trim()
      const rows = Array.from<Element>(
        fixture.nativeElement.querySelectorAll(".incoming .reference"),
      ).map((row) => ({
        label: part(row, ".reference-label"),
        source: part(row, ".reference-source"),
        excerpt: part(row, ".reference-excerpt"),
      }))

      expect(rows).toEqual([
        {
          label: "Marcos 12,31",
          source: "referência cruzada",
          excerpt: "Amarás o teu próximo como a ti mesmo",
        },
        { label: "Lucas 10,27", source: "nota de rodapé", excerpt: undefined },
      ])
    })

    it("lets the reader take the text away again, and forgets what it was built from", async () => {
      const offlineData = TestBed.inject(OfflineDataService)
      const remove = vi
        .spyOn(offlineData, "removeStoredBible")
        .mockResolvedValue()
      const reset = vi.spyOn(reverse, "reset")
      const button = Array.from(
        fixture.nativeElement.querySelectorAll(".incoming .verse-action"),
      ).find((b) =>
        (b as HTMLElement).textContent?.includes("Remover"),
      ) as HTMLButtonElement

      button.click()
      await fixture.whenStable()

      expect(remove).toHaveBeenCalled()
      expect(reset).toHaveBeenCalled()
      expect(component.incoming).toEqual([])
    })

    it("does not offer to remove what the installed app keeps on purpose", async () => {
      vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: true,
      } as MediaQueryList)
      vi.spyOn(reverse, "ensureIndex").mockResolvedValue()
      await component.showIncoming()
      fixture.detectChanges()

      const labels = Array.from(
        fixture.nativeElement.querySelectorAll(".incoming .verse-action"),
      ).map((b) => (b as HTMLElement).textContent)
      expect(labels.join(" ")).not.toContain("Remover")
    })
  })

  describe("its type, as the reader sizes the text", () => {
    /** An element sized by a study token, inside a reader at this text size. */
    const sizeAt = (scale: string | null, token: string): string => {
      const reader = document.createElement("div")
      reader.className = "text-container"
      if (scale) reader.style.setProperty("--reader-text-scale", scale)
      const probe = document.createElement("span")
      probe.style.fontSize = `var(${token})`
      reader.appendChild(probe)
      document.body.appendChild(reader)
      const size = getComputedStyle(probe).fontSize
      reader.remove()
      return size
    }

    it("is what it always was at the standard size", () => {
      expect(sizeAt(null, "--study-type-ui")).toBe("13px")
      expect(sizeAt("1", "--study-type-reading")).toBe("15px")
    })

    it("follows 'Aumentar texto', as the text beside it does", () => {
      expect(sizeAt("1.2", "--study-type-ui")).toBe("15.6px")
      expect(sizeAt("1.2", "--study-type-reading")).toBe("18px")
    })

    it("grows no further than the columns can use, at the largest text sizes", () => {
      expect(sizeAt("2.35", "--study-type-ui")).toBe("19.5px")
    })
  })

  describe("what it is made of, to a pointer", () => {
    it("has colour swatches of a size a pointer can hit", () => {
      const target = verse(37, [plain("Amarás")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      const swatch = fixture.nativeElement.querySelector(
        ".verse-actions .mark-swatch",
      ) as HTMLElement
      expect(getComputedStyle(swatch).width).toBe("24px")
      expect(getComputedStyle(swatch).height).toBe("24px")
    })
  })

  describe("a link to the chosen verse", () => {
    const target = verse(37, [plain("Amarás")])
    const choose = (): void =>
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

    it("is offered beside copying the words", () => {
      choose()

      const labels = Array.from<Element>(
        fixture.nativeElement.querySelectorAll(".verse-actions .verse-action"),
      ).map((button) => button.textContent?.trim())
      expect(labels.some((label) => label?.includes("Copiar ligação"))).toBe(
        true,
      )
    })

    it("copies the address of the verse, and nothing of the reader's note", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
      choose()
      component.noteDraft = "uma nota só minha"

      await component.copyLink()

      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        `${window.location.origin}/mt/22?verseStart=37`,
      )
      expect(component.linkCopied).toBe(true)
    })

    it("says aloud that it did, and that it could not when the clipboard refuses", async () => {
      const announce = vi
        .spyOn(TestBed.inject(LiveAnnouncer), "announce")
        .mockResolvedValue(undefined)
      vi.stubGlobal("navigator", {
        ...navigator,
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      })
      choose()
      announce.mockClear()

      await component.copyLink()

      expect(announce).toHaveBeenCalledWith(
        "Não foi possível copiar a ligação.",
      )
      expect(component.linkCopied).toBe(false)
    })
  })

  describe("the keys it names", () => {
    const keys = (): (string | null)[] =>
      Array.from<Element>(fixture.nativeElement.querySelectorAll(".tab")).map(
        (tab) => tab.getAttribute("aria-keyshortcuts"),
      )

    beforeEach(() => {
      localStorage.removeItem("studyShortcuts")
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })
    })

    afterEach(() => localStorage.removeItem("studyShortcuts"))

    it("are said on each tab, for assistive technology", () => {
      expect(keys()).toEqual(["1", "2", "3", "4"])
      expect(
        fixture.nativeElement
          .querySelector(".collapse-toggle")
          .getAttribute("aria-keyshortcuts"),
      ).toBe("p")
    })

    it("are not said once the reader has turned them off", () => {
      TestBed.inject(StudyModeService).setShortcutsEnabled(false)
      fixture.detectChanges()

      expect(keys()).toEqual([null, null, null, null])
      expect(
        fixture.nativeElement
          .querySelector(".collapse-toggle")
          .hasAttribute("aria-keyshortcuts"),
      ).toBe(false)
    })
  })

  describe("folded away", () => {
    beforeEach(() => {
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(37, [plain("texto"), references("Mc 12,28")])],
        },
      })
    })

    const content = (): HTMLElement =>
      fixture.nativeElement.querySelector(".panel-content")

    it("is out of reach and out of sight, but still there", () => {
      setInputs({ collapsed: true })

      expect(content().hidden).toBe(true)
      expect(content().hasAttribute("inert")).toBe(true)
      // Kept mounted, so what had the focus in it can be given it back.
      expect(content().querySelector(".tab-body")).toBeTruthy()
    })

    it("is reachable again once unfolded", () => {
      setInputs({ collapsed: true })

      setInputs({ collapsed: false })

      expect(content().hidden).toBe(false)
      expect(content().hasAttribute("inert")).toBe(false)
    })
  })

  describe("a chosen verse, in words", () => {
    const chapterWith = (extra: Verse[] = []): Chapter => ({
      bookId: "mat",
      number: 22,
      verses: [
        verse(36, [plain("antes"), references("Mc 12,28")]),
        verse(37, []),
        ...extra,
      ],
    })
    const text = (selector: string): string =>
      (fixture.nativeElement.querySelector(selector)?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()

    beforeEach(() => {
      bibleRef.extract.mockReturnValue([reference("mrk", 12, 28)])
    })

    it("tells a reader with nothing chosen how to begin", () => {
      setInputs({ book: BOOK, chapter: chapterWith() })

      expect(text(".how-to")).toBe(
        "Clique no número de um versículo para o marcar, copiar ou escrever uma nota.",
      )
      expect(fixture.nativeElement.querySelector(".verse-actions")).toBeNull()
    })

    it("says which verse, how many references and whether there is a note", () => {
      const chosen = chapterWith().verses?.[1] as Verse
      setInputs({
        book: BOOK,
        chapter: chapterWith(),
        selection: { verse: chosen },
      })

      expect(text(".verse-caption")).toBe(
        "Versículo 37 · 1 referência · sem nota sua",
      )

      // Typed, not called: the input event is what tells this view to render.
      const box = fixture.nativeElement.querySelector(
        "#study-note",
      ) as HTMLTextAreaElement
      box.value = "alguma coisa"
      box.dispatchEvent(new Event("input", { bubbles: true }))
      fixture.detectChanges()
      expect(text(".verse-caption")).toBe(
        "Versículo 37 · 1 referência · com nota sua",
      )
    })

    it("reads it out when a verse is chosen, since stepping with the keys says nothing", () => {
      const announce = vi
        .spyOn(TestBed.inject(LiveAnnouncer), "announce")
        .mockResolvedValue(undefined)
      const chosen = chapterWith().verses?.[1] as Verse

      setInputs({
        book: BOOK,
        chapter: chapterWith(),
        selection: { verse: chosen },
      })

      expect(announce).toHaveBeenCalledWith(
        "Versículo 37 · 1 referência · sem nota sua. Selecionado.",
      )
    })

    it("puts what a verse can do ahead of the references in the page", () => {
      const chosen = chapterWith().verses?.[1] as Verse
      setInputs({
        book: BOOK,
        chapter: chapterWith(),
        selection: { verse: chosen },
      })

      const body = fixture.nativeElement.querySelector(
        "#study-tabpanel-references",
      ) as HTMLElement
      const actions = body.querySelector(".verse-actions") as Element
      const list = body.querySelector(".reference-group") as Element
      expect(
        actions.compareDocumentPosition(list) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it("says which group of references is the current one, to more than the eye", () => {
      const chosen = chapterWith().verses?.[0] as Verse
      setInputs({
        book: BOOK,
        chapter: chapterWith(),
        selection: { verse: chosen },
      })

      const group = fixture.nativeElement.querySelector(".reference-group")
      expect(group.getAttribute("aria-current")).toBe("true")
    })

    it("names the tab as what it is: the reader's own notes", () => {
      setInputs({ book: BOOK, chapter: chapterWith() })

      const labels = Array.from(
        fixture.nativeElement.querySelectorAll(".tab"),
      ).map((tab) => (tab as HTMLElement).textContent?.trim())
      expect(labels).toContain("As minhas notas")
    })

    it("lists the chapter's notes as links to their verses", () => {
      notes.saveNote("mat", 22, 37, "uma nota")
      setInputs({ book: BOOK, chapter: chapterWith() })
      fixture.nativeElement
        .querySelectorAll(".tab")[2]
        .dispatchEvent(new MouseEvent("click"))
      fixture.detectChanges()

      const link = fixture.nativeElement.querySelector(
        "#study-tabpanel-notes .saved-note a.note-ref",
      ) as HTMLAnchorElement
      expect(link.getAttribute("href")).toBe("/mt/22?verseStart=37")
    })
  })

  describe("when the browser will not keep what is written", () => {
    const target = verse(39, [])

    beforeEach(() => {
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })
    })

    const warning = (): HTMLElement | null =>
      fixture.nativeElement.querySelector(".storage-warning")

    it("says nothing while everything is being kept", () => {
      notes.saveNote("mat", 22, 39, "guardada")
      fixture.detectChanges()

      expect(warning()).toBeNull()
    })

    it("tells the reader, in a way that is announced", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError")
      })

      notes.saveNote("mat", 22, 39, "não fica")
      fixture.detectChanges()

      expect(warning()?.getAttribute("role")).toBe("alert")
      expect(warning()?.textContent).toContain("perde-se ao fechá-la")
    })

    it("also tells the reader when it is a mark that was not kept", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError")
      })

      TestBed.inject(HighlightService).toggle("mat", 22, 39, "yellow")
      fixture.detectChanges()

      expect(warning()).not.toBeNull()
    })

    it("offers the note being written, to copy before it is lost", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError")
      })
      component.onNoteInput("o que escrevi")
      notes.saveNote("mat", 22, 39, "o que escrevi")
      fixture.detectChanges()

      const copy = warning()?.querySelector("button") as HTMLButtonElement
      copy.click()

      expect(writeText).toHaveBeenCalledExactlyOnceWith("o que escrevi")
    })

    it("stops warning once the browser keeps a write again", () => {
      const refuse = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceededError")
        })
      notes.saveNote("mat", 22, 39, "primeira")
      fixture.detectChanges()
      expect(warning()).not.toBeNull()

      refuse.mockRestore()
      notes.saveNote("mat", 22, 39, "segunda")
      fixture.detectChanges()

      expect(warning()).toBeNull()
    })
  })

  describe("notes", () => {
    it("loads the note already written for the selected verse", () => {
      notes.saveNote("mat", 22, 39, "escrita antes")
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      expect(component.noteDraft).toBe("escrita antes")
    })

    it("saves what the reader types, once they stop typing", async () => {
      vi.useFakeTimers()
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      component.onNoteInput("a minha nota")
      expect(notes.getNote("mat", 22, 39)).toBeUndefined()

      await vi.advanceTimersByTimeAsync(500)
      expect(notes.getNote("mat", 22, 39)?.text).toBe("a minha nota")
    })

    it("files a pending save under the book it was typed in", async () => {
      vi.useFakeTimers()
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })
      component.onNoteInput("sobre Mateus")

      // The reader follows a reference into another book before the save.
      const other = verse(39, [])
      setInputs({
        book: { ...BOOK, id: "luk" },
        chapter: { bookId: "luk", number: 22, verses: [other] },
        selection: null,
      })
      await vi.advanceTimersByTimeAsync(500)

      expect(notes.getNote("mat", 22, 39)?.text).toBe("sobre Mateus")
      expect(notes.getNote("luk", 22, 39)).toBeUndefined()
    })

    it("lets a note deleted by emptying its box be put back", () => {
      notes.saveNote("mat", 22, 39, "para não perder")
      const undo = new Subject<void>()
      const open = vi
        .spyOn(TestBed.inject(MatSnackBar), "open")
        .mockReturnValue({
          onAction: () => undo.asObservable(),
        } as MatSnackBarRef<TextOnlySnackBar>)
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      // Select all, and a key: that is all deleting a note takes.
      component.onNoteInput("")
      component.onNoteBlur()
      expect(notes.getNote("mat", 22, 39)).toBeUndefined()
      expect(open).toHaveBeenCalledExactlyOnceWith(
        "Nota apagada",
        "Anular",
        expect.any(Object),
      )

      undo.next()
      expect(notes.getNote("mat", 22, 39)?.text).toBe("para não perder")
      expect(component.noteDraft).toBe("para não perder")
    })

    it("names the colour on each swatch", () => {
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      const first = fixture.nativeElement.querySelector(".mark-swatch")

      expect(first.getAttribute("aria-label")).toBe("Marcar 22,39 a amarelo")
    })

    it("saves immediately when the reader leaves the box", () => {
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      component.onNoteInput("por guardar")
      component.onNoteBlur()

      expect(notes.getNote("mat", 22, 39)?.text).toBe("por guardar")
    })

    it("clears the draft when the selection goes away", () => {
      notes.saveNote("mat", 22, 39, "uma nota")
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      setInputs({ selection: null })

      expect(component.noteDraft).toBe("")
    })

    // Driven by tick rather than by a real 260ms wait: the debounce is 200ms,
    // and a loaded machine can run the subscriber after the assertion.
    it("saves what is still being typed when the panel goes", async () => {
      vi.useFakeTimers()
      // Leaving study mode, a window narrowed past the layout, a route
      // change: the box is removed, which does not reliably blur it, and the
      // waiting save used to go with it.
      const target = verse(39, [plain("Amarás ao Senhor")])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })
      component.onNoteInput("sobre o amor")
      await vi.advanceTimersByTimeAsync(100)

      fixture.destroy()

      expect(notes.getNote("mat", 22, 39)?.text).toBe("sobre o amor")
    })

    it("saves the verse being left when the reader moves on mid-note", async () => {
      vi.useFakeTimers()
      // A keyboard path can change the verse with the box still focused, so
      // no blur runs. The next keystroke replaced the waiting value, and the
      // first verse's note was never written.
      const first = verse(39, [plain("Amarás ao Senhor")])
      const second = verse(40, [plain("Destes dois mandamentos")])
      const chapter = { bookId: "mat", number: 22, verses: [first, second] }
      setInputs({ book: BOOK, chapter, selection: { verse: first } })
      component.onNoteInput("sobre o amor")
      await vi.advanceTimersByTimeAsync(100)

      setInputs({ selection: { verse: second } })
      component.onNoteInput("sobre a lei")
      await vi.advanceTimersByTimeAsync(NOTE_SAVE_DEBOUNCE_MS)

      expect(notes.getNote("mat", 22, 39)?.text).toBe("sobre o amor")
      expect(notes.getNote("mat", 22, 40)?.text).toBe("sobre a lei")
    })

    it("finds a note by its words, across books", async () => {
      vi.useFakeTimers()
      notes.saveNote("mat", 22, 39, "sobre o amor ao próximo")
      notes.saveNote("psa", 1, 2, "a lei do Senhor")
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })

      component.onNoteQuery("lei")
      await vi.advanceTimersByTimeAsync(NOTE_SEARCH_DEBOUNCE_MS)

      expect(component.noteMatches.map((note) => note.bookId)).toEqual(["psa"])
    })

    it("ignores accents and case when searching", async () => {
      vi.useFakeTimers()
      notes.saveNote("mat", 22, 39, "sobre o coração")
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })

      component.onNoteQuery("CORACAO")
      await vi.advanceTimersByTimeAsync(NOTE_SEARCH_DEBOUNCE_MS)

      expect(component.noteMatches.length).toBe(1)
    })

    it("lists the chapter's other notes", () => {
      notes.saveNote("mat", 22, 12, "doze")
      notes.saveNote("mat", 23, 1, "outro capítulo")
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })

      expect(component.chapterNotes.map((note) => note.verse)).toEqual([12])
    })

    it("offers no note box until a verse is chosen", () => {
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })
      // Clicked rather than set: the click is what marks this OnPush view
      // dirty, exactly as it does for a reader.
      const notesTab = fixture.nativeElement.querySelectorAll(".tab")[2]
      notesTab.dispatchEvent(new MouseEvent("click"))
      fixture.detectChanges()

      const panel = fixture.nativeElement.querySelector("#study-tabpanel-notes")
      expect(panel.querySelector(".note-input")).toBeNull()
      expect(panel.querySelector(".panel-empty").textContent).toContain(
        "Clique no número de um versículo",
      )
    })
  })
})
