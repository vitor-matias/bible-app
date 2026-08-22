import { SimpleChange } from "@angular/core"
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
import { NotesService } from "../../services/notes.service"
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
  }): void {
    const changes: Record<string, SimpleChange> = {}
    for (const [key, value] of Object.entries(next)) {
      const previous = (component as unknown as Record<string, unknown>)[key]
      ;(component as unknown as Record<string, unknown>)[key] = value
      changes[key] = new SimpleChange(previous, value, previous === undefined)
    }
    component.ngOnChanges(changes)
    fixture.detectChanges()
  }

  beforeEach(async () => {
    localStorage.removeItem("verseNotes")

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
      // setInput, not a plain assignment: it marks this OnPush view dirty the
      // way a real binding does.
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
