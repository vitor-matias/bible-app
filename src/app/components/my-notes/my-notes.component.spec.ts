import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { BehaviorSubject, filter, of, throwError } from "rxjs"
import { BibleApiService } from "../../services/bible-api.service"
import { BookService } from "../../services/book.service"
import { HighlightService } from "../../services/highlight.service"
import { NotesService } from "../../services/notes.service"
import { SeoService } from "../../services/seo.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { BACKUP_APP } from "../../utils/study-backup"
import { MyNotesComponent } from "./my-notes.component"

const NAMES: Record<string, string> = {
  gen: "Génesis",
  mat: "Mateus",
  jhn: "João",
}

const chapterOf = (bookId: string, number: number, words: string[]): Chapter =>
  ({
    bookId,
    number,
    verses: words.map((text, index) => ({
      bookId,
      chapterNumber: number,
      number: index + 1,
      text: [{ type: "text", text }],
    })),
  }) as unknown as Chapter

describe("MyNotesComponent", () => {
  let fixture: ComponentFixture<MyNotesComponent>
  let component: MyNotesComponent
  let notes: NotesService
  let marks: HighlightService
  let api: SpyObj<BibleApiService>
  let bookList: BehaviorSubject<Book[]>

  const page = (): HTMLElement => fixture.nativeElement
  const refs = (): string[] =>
    Array.from(page().querySelectorAll(".entry-ref")).map((e) =>
      (e.textContent ?? "").trim(),
    )
  /** Picks an option the way a reader does, so the page is told. */
  const choose = (which: "Mostrar" | "Livro", value: string): void => {
    const select = Array.from(page().querySelectorAll("label"))
      .find((label) => label.textContent?.trim().startsWith(which))
      ?.querySelector("select") as HTMLSelectElement
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
    fixture.detectChanges()
  }
  const button = (label: string): HTMLButtonElement =>
    Array.from(page().querySelectorAll("button")).find((b) =>
      b.textContent?.includes(label),
    ) as HTMLButtonElement

  beforeEach(async () => {
    localStorage.removeItem("verseNotes")
    localStorage.removeItem("verseHighlights")
    api = createSpyObj<BibleApiService>("BibleApiService", ["getChapter"])
    api.getChapter.mockImplementation((bookId: string, chapter: number) =>
      of(
        chapterOf(bookId, chapter, [
          `Palavras de ${bookId} ${chapter},1`,
          `Palavras de ${bookId} ${chapter},2`,
        ]),
      ),
    )
    const books = createSpyObj<BookService>("BookService", [
      "findBook",
      "getUrlAbrv",
      "getChapterUrlSegment",
    ])
    books.findBook.mockImplementation(
      (id: string) => ({ id, shortName: NAMES[id] ?? id }) as Book,
    )
    books.getUrlAbrv.mockImplementation((book: Book) => book.id)
    books.getChapterUrlSegment.mockImplementation((n: number) => String(n))
    bookList = new BehaviorSubject<Book[]>([{ id: "gen" } as Book])
    Object.assign(books, {
      books$: bookList.pipe(filter((list) => list.length > 0)),
    })

    await TestBed.configureTestingModule({
      imports: [MyNotesComponent],
      providers: [
        provideRouter([]),
        { provide: BibleApiService, useValue: api },
        { provide: BookService, useValue: books },
      ],
    }).compileComponents()
    notes = TestBed.inject(NotesService)
    marks = TestBed.inject(HighlightService)
    fixture = TestBed.createComponent(MyNotesComponent)
    component = fixture.componentInstance
  })

  afterEach(() => {
    localStorage.removeItem("verseNotes")
    localStorage.removeItem("verseHighlights")
  })

  it("keeps itself out of the search index", () => {
    const seo = vi
      .spyOn(TestBed.inject(SeoService), "updateForMyNotes")
      .mockReturnValue(undefined)

    fixture.detectChanges()

    expect(seo).toHaveBeenCalledOnce()
  })

  it("says how to begin when there is nothing yet", () => {
    fixture.detectChanges()

    expect(page().textContent).toContain("Ainda não escreveu nem marcou nada")
    expect(page().querySelector(".entries")).toBeNull()
    expect(button("Guardar uma cópia").disabled).toBe(true)
  })

  it("lists notes and marks in the Bible's order, each a link to its verse", () => {
    notes.saveNote("jhn", 3, 16, "Deus amou o mundo")
    marks.toggle("gen", 1, 1, "blue")
    notes.saveNote("mat", 22, 37, "o maior mandamento")
    fixture.detectChanges()

    expect(refs()).toEqual(["Génesis 1,1", "Mateus 22,37", "João 3,16"])
    const link = page().querySelectorAll(".entry-ref a")[1] as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("/mat/22?verseStart=37")
  })

  it("lists nothing until the book list has come, rather than under the About page's name", () => {
    // A page opened by its address: the book list is still on its way.
    bookList = new BehaviorSubject<Book[]>([])
    Object.assign(TestBed.inject(BookService), {
      books$: bookList.pipe(filter((list) => list.length > 0)),
    })
    fixture = TestBed.createComponent(MyNotesComponent)
    notes.saveNote("mat", 22, 37, "o maior mandamento")
    fixture.detectChanges()

    // Neither the empty-state (there is a note) nor an entry named wrongly.
    expect(page().querySelector(".entries")).toBeNull()
    expect(page().querySelector(".empty")).toBeNull()
    // The copy to keep does not need the names, so it is not held back; the
    // printed page, the copied list and the text file do, and would name every
    // entry after the About page.
    expect(button("Guardar uma cópia").disabled).toBe(false)
    for (const label of [
      "Imprimir a lista",
      "Copiar a lista",
      "Guardar como texto",
    ]) {
      expect(button(label).disabled).toBe(true)
    }

    bookList.next([{ id: "mat" } as Book])
    fixture.detectChanges()

    expect(refs()).toEqual(["Mateus 22,37"])
    for (const label of [
      "Imprimir a lista",
      "Copiar a lista",
      "Guardar como texto",
    ]) {
      expect(button(label).disabled).toBe(false)
    }
  })

  it("says the colour of a mark in words", () => {
    marks.toggle("mat", 22, 37, "pink")
    fixture.detectChanges()

    expect(page().querySelector(".entry-mark")?.textContent).toContain(
      "Marca: rosa",
    )
  })

  it("quotes the verse once its chapter has come", () => {
    notes.saveNote("mat", 22, 2, "uma nota")
    fixture.detectChanges()

    expect(page().querySelector(".entry-quote")?.textContent).toContain(
      "Palavras de mat 22,2",
    )
  })

  it("still lists a verse whose chapter could not be fetched", () => {
    api.getChapter.mockReturnValue(throwError(() => new Error("offline")))
    notes.saveNote("mat", 22, 2, "sem texto")
    fixture.detectChanges()

    expect(refs()).toEqual(["Mateus 22,2"])
    expect(page().querySelector(".entry-quote")).toBeNull()
    expect(page().querySelector(".entry-text")?.textContent).toBe("sem texto")
  })

  it("asks again for a chapter that could not be fetched, when the notes next change", () => {
    api.getChapter.mockReturnValueOnce(throwError(() => new Error("offline")))
    notes.saveNote("mat", 22, 2, "sem texto")
    fixture.detectChanges()
    expect(page().querySelector(".entry-quote")).toBeNull()

    // Back online by now: any change to the notes asks again.
    notes.saveNote("mat", 22, 3, "outra")
    fixture.detectChanges()

    expect(api.getChapter).toHaveBeenCalledTimes(2)
    expect(page().querySelector(".entry-quote")?.textContent).toContain(
      "Palavras de mat 22,2",
    )
  })

  it("asks for each chapter once, however many verses it holds", () => {
    notes.saveNote("mat", 22, 1, "a")
    notes.saveNote("mat", 22, 2, "b")
    marks.toggle("mat", 22, 2, "green")
    fixture.detectChanges()

    expect(api.getChapter).toHaveBeenCalledTimes(1)
  })

  describe("narrowing the list", () => {
    beforeEach(() => {
      notes.saveNote("mat", 22, 37, "só nota")
      marks.toggle("mat", 22, 38, "yellow")
      marks.toggle("jhn", 3, 16, "blue")
      notes.saveNote("jhn", 3, 16, "nota e marca")
      fixture.detectChanges()
    })

    it("by what is on a verse", () => {
      choose("Mostrar", "notes")
      expect(refs()).toEqual(["Mateus 22,37", "João 3,16"])

      choose("Mostrar", "blue")
      expect(refs()).toEqual(["João 3,16"])

      choose("Mostrar", "marks")
      expect(refs()).toEqual(["Mateus 22,38", "João 3,16"])
    })

    it("by book, and says how many of the whole it is showing", () => {
      choose("Livro", "jhn")

      expect(refs()).toEqual(["João 3,16"])
      expect(page().querySelector(".count")?.textContent).toContain(
        "A mostrar 1",
      )
    })

    it("and says so when nothing is left", () => {
      choose("Livro", "mat")
      choose("Mostrar", "blue")

      expect(page().querySelector(".empty")?.textContent).toContain(
        "Nada corresponde",
      )
    })
  })

  it("copies the list as it is shown, as plain text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
    notes.saveNote("mat", 22, 37, "o maior mandamento")
    notes.saveNote("jhn", 3, 16, "fora do filtro")
    fixture.detectChanges()
    component.onBook("mat")

    await component.copyList()

    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain("Mateus 22,37")
    expect(copied).toContain("Nota:\no maior mandamento")
    expect(copied).not.toContain("João")
  })

  describe("the copy to keep", () => {
    let saved: Blob[]
    let clicked: string[]

    beforeEach(() => {
      saved = []
      clicked = []
      vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
        saved.push(blob as Blob)
        return "blob:copia"
      })
      vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined)
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function (this: HTMLAnchorElement) {
          clicked.push(this.download)
        },
      )
    })

    it("holds everything, whatever the filters show", async () => {
      notes.saveNote("mat", 22, 37, "uma")
      marks.toggle("jhn", 3, 16, "green")
      fixture.detectChanges()
      component.onBook("mat")

      component.saveBackup()

      const backup = JSON.parse(await saved[0].text())
      expect(backup.app).toBe(BACKUP_APP)
      expect(backup.notes).toHaveLength(1)
      expect(backup.highlights).toMatchObject([
        { bookId: "jhn", color: "green" },
      ])
      expect(clicked[0]).toMatch(/^biblia-copia-\d{4}-\d{2}-\d{2}\.json$/)
    })

    it("can be read back, here or on another computer", async () => {
      notes.saveNote("mat", 22, 37, "a nota que guardei")
      marks.toggle("jhn", 3, 16, "green")
      fixture.detectChanges()
      component.saveBackup()
      const text = await saved[0].text()
      notes.deleteAll()
      marks.clearAll()
      expect(notes.getNote("mat", 22, 37)).toBeUndefined()

      await component.onFile(fileInput(text))

      expect(notes.getNote("mat", 22, 37)?.text).toBe("a nota que guardei")
      expect(marks.colorFor("jhn", 3, 16)).toBe("green")
      expect(component.status).toContain("Lidas 1 notas e 1 marcas")
    })

    it("says what it kept because it was newer, and does not undo later writing", async () => {
      notes.saveNote("mat", 22, 37, "versão de hoje")
      const old = JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        notes: [
          {
            bookId: "mat",
            chapter: 22,
            verse: 37,
            text: "versão antiga",
            updatedAt: 1,
          },
        ],
        highlights: [],
      })

      await component.onFile(fileInput(old))

      expect(notes.getNote("mat", 22, 37)?.text).toBe("versão de hoje")
      expect(component.status).toContain("1 já cá estavam, mais recentes")
    })

    it("refuses what is not a copy, and changes nothing", async () => {
      notes.saveNote("mat", 22, 37, "intacta")

      await component.onFile(fileInput("isto não é uma cópia"))

      expect(component.status).toContain("não é uma cópia")
      expect(notes.getNote("mat", 22, 37)?.text).toBe("intacta")
    })
  })

  describe("deleting everything", () => {
    beforeEach(() => {
      notes.saveNote("mat", 22, 37, "a perder")
      marks.toggle("mat", 22, 37, "pink")
      fixture.detectChanges()
    })

    it("asks first, and a change of mind costs nothing", () => {
      button("Apagar as minhas notas").click()
      fixture.detectChanges()
      expect(page().textContent).toContain("Não se pode desfazer")

      button("Cancelar").click()
      fixture.detectChanges()

      expect(notes.getNote("mat", 22, 37)).toBeDefined()
      expect(page().textContent).not.toContain("Não se pode desfazer")
    })

    it("then clears the notes and the marks", () => {
      button("Apagar as minhas notas").click()
      fixture.detectChanges()
      button("Apagar tudo").click()
      fixture.detectChanges()

      expect(notes.getNote("mat", 22, 37)).toBeUndefined()
      expect(marks.colorFor("mat", 22, 37)).toBeUndefined()
      expect(page().textContent).toContain("Ainda não escreveu nem marcou nada")
    })
  })

  it("warns, loudly, when the browser will not keep what is written", () => {
    fixture.detectChanges()
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })

    notes.saveNote("mat", 22, 37, "não fica")
    fixture.detectChanges()

    expect(page().querySelector(".warning")?.getAttribute("role")).toBe("alert")
  })
})

/** An <input type="file"> holding one file with this text. */
function fileInput(text: string): HTMLInputElement {
  const input = document.createElement("input")
  input.type = "file"
  const transfer = new DataTransfer()
  transfer.items.add(
    new File([text], "copia.json", { type: "application/json" }),
  )
  input.files = transfer.files
  return input
}
