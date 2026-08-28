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
import { StudyPanelComponent } from "./study-panel.component"

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

function references(text: string): References {
  return { type: "references", text, normalizedText: text }
}

function footnote(reference: string, text: string): _Footnote {
  return { type: "footnote", reference, text }
}

function plain(text: string): _Text {
  return { type: "text", text, normalizedText: text }
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
    it("lists every reference in the chapter, grouped by the verse printing it", () => {
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

      expect(component.referenceGroups.length).toBe(1)
      expect(component.referenceGroups[0].label).toBe("22,34")
      expect(component.referenceGroups[0].entries[0].label).toBe(
        "Marcos 12,28-34",
      )
    })

    it("labels the chapter's opening parallels with verse one, not zero", () => {
      bibleRef.extract.and.returnValue([reference("luk", 14, 15, 24)])
      setInputs({
        book: BOOK,
        chapter: {
          bookId: "mat",
          number: 22,
          // Verse 0 is the front matter this edition prints them on.
          verses: [verse(0, [references("Lc 14,15-24")])],
        },
      })

      expect(component.referenceGroups[0].label).toBe("22,1")
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
      expect(fixture.nativeElement.querySelector(".reference-more")).toBeNull()
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
        { number: 31, text: "Não há mandamento maior do que estes." },
      ])
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

      expect(component.footnotes.map((entry) => entry.label)).toEqual([
        "22,2",
        "22,11",
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
