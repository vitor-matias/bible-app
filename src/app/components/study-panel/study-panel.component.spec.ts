import {
  type ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { of, throwError } from "rxjs"
import { BibleApiService } from "../../services/bible-api.service"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { HighlightService } from "../../services/highlight.service"
import { NotesService } from "../../services/notes.service"
import { ReverseReferencesService } from "../../services/reverse-references.service"
import {
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
  return { type: "section", tag: "s1", text, normalizedText: text }
}

/** The title of a division — "PRÓLOGO" — rather than of a passage. */
function majorHeading(text: string): Section {
  return { type: "section", tag: "ms", text, normalizedText: text }
}

function references(text: string): References {
  return { type: "references", text, normalizedText: text }
}

function footnote(reference: string, text: string): _Footnote {
  return { type: "footnote", reference, text }
}

function plain(text: string): _Text {
  return { type: "text", text, normalizedText: text }
}

function paragraph(text: string): Paragraph {
  return { type: "paragraph", text, normalizedText: text }
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
  let api: jasmine.SpyObj<BibleApiService>
  let bibleRef: jasmine.SpyObj<BibleReferenceService>
  let notes: NotesService

  function setInputs(next: {
    book?: Book
    chapter?: Chapter | null
    selection?: VerseSelection | null
    visibleVerse?: Verse["number"]
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

    api = jasmine.createSpyObj<BibleApiService>("BibleApiService", [
      "getChapter",
    ])
    api.getChapter.and.returnValue(
      of({ bookId: "mrk", number: 12, verses: [] }),
    )

    bibleRef = jasmine.createSpyObj<BibleReferenceService>(
      "BibleReferenceService",
      ["extract"],
    )
    bibleRef.extract.and.returnValue([])

    const bookService = jasmine.createSpyObj<BookService>("BookService", [
      "findBook",
      "getUrlAbrv",
    ])
    bookService.findBook.and.callFake((id: string) =>
      id === "mrk" || id === "Mc" ? MARK : BOOK,
    )
    bookService.getUrlAbrv.and.callFake((book: Book) => book.abrv.toLowerCase())

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
    it("groups references under the passage they open, not the verse before it", () => {
      bibleRef.extract.and.callFake((text: string) =>
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
      bibleRef.extract.and.callFake((text: string) =>
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
      bibleRef.extract.and.returnValue([
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
      bibleRef.extract.and.returnValue([
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
      api.getChapter.and.returnValue(
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
      expect(entry.truncated).toBeTrue()
    })

    it("keeps the references printed after that range", () => {
      // Matthew heads its first division "(1,1-2,23; ver Lc 1,5-2,52)": the
      // division's own extent, and then the gospel to read beside it. Only
      // the extent is the heading's own.
      bibleRef.extract.and.returnValue([
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
      bibleRef.extract.and.callFake((text: string) =>
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
      bibleRef.extract.and.returnValue([reference("luk", 14, 15, 24)])
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
      bibleRef.extract.and.returnValue([
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
      bibleRef.extract.and.callFake((text: string) =>
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
      bibleRef.extract.and.returnValue([reference("mrk", 12, 28, 34)])
      api.getChapter.and.returnValue(
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
      expect(entry.truncated).toBeTrue()
      expect(
        fixture.nativeElement.querySelector(".reference-more"),
      ).toBeTruthy()
    })

    it("does not mark a short passage as running on", () => {
      bibleRef.extract.and.returnValue([reference("mrk", 12, 30, 31)])
      api.getChapter.and.returnValue(
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
      bibleRef.extract.and.returnValue([reference("mrk", 12, 31)])
      api.getChapter.and.returnValue(throwError(() => new Error("offline")))
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
      bibleRef.extract.and.returnValue([reference("mrk", 12, 31)])
      api.getChapter.and.returnValue(
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
                  normalizedText: "Título",
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
      bibleRef.extract.and.returnValue([
        { match: "Jb 38", index: 0, book: "job", chapter: 38 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.and.returnValue(
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
      expect(entry.truncated).toBeTrue()
    })

    it("does not open a quoted psalm on an invisible character", () => {
      bibleRef.extract.and.returnValue([
        { match: "Sl 8", index: 0, book: "psa", chapter: 8 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.and.returnValue(
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
                { type: "quote", text: "\u200b", normalizedText: "" },
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
      bibleRef.extract.and.returnValue([
        { match: "Sl 104", index: 0, book: "psa", chapter: 104 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.and.returnValue(
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
                { type: "quote", text: "\u200b", normalizedText: "" },
                {
                  type: "text",
                  text: "Bendiz, ó minha alma, o ",
                  normalizedText: "",
                },
                {
                  type: "text",
                  text: "Senhor",
                  normalizedText: "",
                  allCaps: true,
                },
                { type: "text", text: "!", normalizedText: "" },
                {
                  type: "quote",
                  text: "Estás revestido de esplendor",
                  normalizedText: "",
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
      expect(preview.lines[0].some((run) => run.allCaps)).toBeTrue()
      expect(preview.lines[1][0].text).toBe("Estás revestido de esplendor")
    })

    it("breaks where the edition does, on a paragraph as well as a quote", () => {
      // Hebrews 1,5 is a line of prose and then the scripture it quotes, set
      // by this edition as a paragraph. Run together it reads "disse Deus
      // alguma vez:Tu és meu Filho".
      bibleRef.extract.and.returnValue([
        { match: "Hb 1,5", index: 0, book: "heb", chapter: 1 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.and.returnValue(
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
      bibleRef.extract.and.returnValue([
        { match: "Sl 104", index: 0, book: "psa", chapter: 104 },
      ] as ReturnType<BibleReferenceService["extract"]>)
      const poetry = (number: number) => ({
        bookId: "psa",
        chapterNumber: 104,
        number,
        verseLabel: String(number),
        text: [
          { type: "quote", text: `linha ${number}`, normalizedText: "" },
        ] as TextType[],
      })
      api.getChapter.and.returnValue(
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
      expect(first.breakBefore).toBeFalse()
      // Otherwise verse 2's number runs straight into the end of verse 1.
      expect(second.breakBefore).toBeTrue()
    })

    it("lets prose verses run on, as the chapter does", () => {
      bibleRef.extract.and.returnValue([reference("mrk", 12, 30, 31)])
      const prose = (number: number) => ({
        bookId: "mrk",
        chapterNumber: 12,
        number,
        verseLabel: String(number),
        text: [plain(`verso ${number}`)],
      })
      api.getChapter.and.returnValue(
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
      expect(verses.every((v) => !v.breakBefore)).toBeTrue()
    })

    it("names both ends of a run of whole chapters", () => {
      bibleRef.extract.and.returnValue([
        {
          match: "Jb 38-39",
          index: 0,
          book: "job",
          chapter: 38,
          endChapter: 39,
        },
      ] as ReturnType<BibleReferenceService["extract"]>)
      api.getChapter.and.returnValue(
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
      bibleRef.extract.and.returnValue([reference("mrk", 12, 31)])
      api.getChapter.and.returnValue(throwError(() => new Error("offline")))
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          verses: [verse(39, [references("Mc 12,31")])],
        },
      })

      const entry = component.referenceGroups[0].entries[0]
      expect(entry.failed).toBeTrue()
      expect(entry.link).toEqual(["/", "mc", 12])
    })

    it("does not refetch when the reader only selects a verse", () => {
      bibleRef.extract.and.returnValue([reference("mrk", 12, 31)])
      const chapter: Chapter = {
        bookId: "mat",
        number: 22,
        verses: [verse(39, [references("Mc 12,31")])],
      }
      setInputs({ book: BOOK, chapter })
      api.getChapter.calls.reset()

      setInputs({ selection: { verse: chapter.verses?.[0] as Verse } })

      expect(api.getChapter).not.toHaveBeenCalled()
    })

    it("keeps the passage's references marked for every verse in it", () => {
      bibleRef.extract.and.callFake((text: string) =>
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
              normalizedText: "",
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
              normalizedText: "",
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
        expect(component.isCurrentGroup(group))
          .withContext(`verse ${number}`)
          .toBeTrue()
      }

      // The next passage is not this one.
      setInputs({
        selection: {
          verse: chapter.verses?.find((v) => v.number === 41) as Verse,
        },
      })
      expect(component.isCurrentGroup(group)).toBeFalse()
    })

    it("follows the verse on screen without marking it", () => {
      bibleRef.extract.and.callFake((text: string) =>
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
      expect(component.isCurrentGroup(component.referenceGroups[0])).toBeFalse()
      expect(
        fixture.nativeElement.querySelector(".reference-group.current"),
      ).toBeNull()
    })

    it("marks the passage once the reader picks a verse in it", () => {
      bibleRef.extract.and.callFake((text: string) =>
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

      expect(component.isCurrentGroup(component.referenceGroups[0])).toBeTrue()
      expect(
        fixture.nativeElement.querySelector(".reference-group.current"),
      ).toBeTruthy()
    })

    it("stops marking when the reader lets the verse go", () => {
      bibleRef.extract.and.callFake((text: string) =>
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
      expect(component.isCurrentGroup(component.referenceGroups[0])).toBeTrue()

      setInputs({ selection: null, visibleVerse: 34 })

      expect(component.isCurrentGroup(component.referenceGroups[0])).toBeFalse()
    })

    it("lets a chosen verse outrank the one on screen", () => {
      bibleRef.extract.and.returnValue([])
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
      bibleRef.extract.and.returnValue([])
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

    it("marks the selected verse's group as the current one", () => {
      bibleRef.extract.and.returnValue([reference("mrk", 12, 31)])
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
      bibleRef.extract.and.callFake((text: string) =>
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
        jasmine.objectContaining({
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

      expect(
        fixture.nativeElement.querySelector(".tab.active").textContent.trim(),
      ).toBe("Notas de rodapé")
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
      spyOn(navigator.clipboard, "writeText").and.callFake((text: string) => {
        written.push(text)
        return Promise.resolve()
      })
      selectVerse()

      await component.copySelectedVerse()

      expect(written).toEqual(["Amarás ao Senhor (Mateus 22,37)"])
      expect(component.copied).toBeTrue()
    })

    it("says nothing when the clipboard refuses", async () => {
      spyOn(navigator.clipboard, "writeText").and.rejectWith(
        new Error("denied"),
      )
      selectVerse()

      await component.copySelectedVerse()

      // The verse is still on screen to select by hand; an error thrown over
      // the text would help nobody.
      expect(component.copied).toBeFalse()
    })
  })

  describe("what cites this verse", () => {
    it("offers to look rather than indexing the corpus unasked", () => {
      const reverse = TestBed.inject(ReverseReferencesService)
      const build = spyOn(reverse, "ensureIndex").and.resolveTo()
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
      const build = spyOn(reverse, "ensureIndex").and.resolveTo()
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

    it("saves what the reader types, once they stop typing", fakeAsync(() => {
      const target = verse(39, [])
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [target] },
        selection: { verse: target },
      })

      component.onNoteInput("a minha nota")
      expect(notes.getNote("mat", 22, 39)).toBeUndefined()

      tick(500)
      expect(notes.getNote("mat", 22, 39)?.text).toBe("a minha nota")
    }))

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

    it("finds a note by its words, across books", (done) => {
      notes.saveNote("mat", 22, 39, "sobre o amor ao próximo")
      notes.saveNote("psa", 1, 2, "a lei do Senhor")
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })

      component.onNoteQuery("lei")
      setTimeout(() => {
        expect(component.noteMatches.map((note) => note.bookId)).toEqual([
          "psa",
        ])
        done()
      }, 260)
    })

    it("ignores accents and case when searching", (done) => {
      notes.saveNote("mat", 22, 39, "sobre o coração")
      setInputs({
        book: BOOK,
        chapter: { bookId: "mat", number: 22, verses: [] },
      })

      component.onNoteQuery("CORACAO")
      setTimeout(() => {
        expect(component.noteMatches.length).toBe(1)
        done()
      }, 260)
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
        "Escolha um versículo",
      )
    })
  })
})
