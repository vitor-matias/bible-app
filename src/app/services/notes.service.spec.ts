import { TestBed } from "@angular/core/testing"
import { NotesService, type VerseNote } from "./notes.service"

const STORAGE_KEY = "verseNotes"

function makeService(): NotesService {
  TestBed.resetTestingModule()
  TestBed.configureTestingModule({ providers: [NotesService] })
  return TestBed.inject(NotesService)
}

describe("NotesService", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  it("keeps a saved note and reads it back", () => {
    const service = makeService()
    service.saveNote("mat", 22, 39, "O segundo mandamento")

    expect(service.getNote("mat", 22, 39)?.text).toBe("O segundo mandamento")
  })

  it("survives a reload, because notes live in storage", () => {
    makeService().saveNote("mat", 22, 39, "guardado")

    expect(makeService().getNote("mat", 22, 39)?.text).toBe("guardado")
  })

  it("trims what it stores", () => {
    const service = makeService()
    service.saveNote("mat", 22, 39, "   com espaços   ")

    expect(service.getNote("mat", 22, 39)?.text).toBe("com espaços")
  })

  it("removes the note when the box is emptied", () => {
    const service = makeService()
    service.saveNote("mat", 22, 39, "algo")
    service.saveNote("mat", 22, 39, "   ")

    expect(service.getNote("mat", 22, 39)).toBeUndefined()
  })

  it("replaces a note rather than keeping both versions", () => {
    const service = makeService()
    service.saveNote("mat", 22, 39, "primeira")
    service.saveNote("mat", 22, 39, "segunda")

    const stored: VerseNote[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    )
    expect(stored.length).toBe(1)
    expect(stored[0].text).toBe("segunda")
  })

  it("keeps notes on other verses, chapters and books apart", () => {
    const service = makeService()
    service.saveNote("mat", 22, 39, "aqui")
    service.saveNote("mat", 22, 40, "vizinho")
    service.saveNote("mat", 23, 39, "outro capítulo")
    service.saveNote("mrk", 22, 39, "outro livro")

    expect(service.getNote("mat", 22, 39)?.text).toBe("aqui")
    expect(service.getNote("mrk", 22, 39)?.text).toBe("outro livro")
  })

  it("lists a chapter's notes in verse order", (done) => {
    const service = makeService()
    service.saveNote("mat", 22, 40, "quarenta")
    service.saveNote("mat", 22, 12, "doze")
    service.saveNote("mat", 23, 1, "outro capítulo")

    service.notesForChapter("mat", 22).subscribe((notes) => {
      expect(notes.map((note) => note.verse)).toEqual([12, 40])
      done()
    })
  })

  it("emits the updated chapter list as notes are written", () => {
    const service = makeService()
    const seen: number[][] = []
    service
      .notesForChapter("mat", 22)
      .subscribe((notes) => seen.push(notes.map((note) => note.verse)))

    service.saveNote("mat", 22, 39, "uma")
    service.deleteNote("mat", 22, 39)

    expect(seen).toEqual([[], [39], []])
  })

  it("does not emit for a delete that removes nothing", () => {
    const service = makeService()
    let emissions = 0
    service.notes$.subscribe(() => emissions++)

    service.deleteNote("mat", 22, 39)

    expect(emissions).toBe(1)
  })

  it("starts empty when storage holds something that is not JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")

    expect(makeService().getNote("mat", 22, 39)).toBeUndefined()
  })

  it("drops stored entries that are not usable notes", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { bookId: "mat", chapter: 22, verse: 39, text: "boa", updatedAt: 1 },
        { bookId: "mat", chapter: 22 },
        "lixo",
        { bookId: "mat", chapter: 22, verse: 40, text: "", updatedAt: 1 },
      ]),
    )

    const service = makeService()
    expect(service.getNote("mat", 22, 39)?.text).toBe("boa")
    expect(service.getNote("mat", 22, 40)).toBeUndefined()
  })
})
