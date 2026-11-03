import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
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

  it("carries on when storage refuses a read after passing its probe", () => {
    const service = makeService()
    // The probe behind safeLocalStorage() ran when the service was made; a
    // storage can still refuse later (quota, a revoked permission).
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })

    expect(() => service.saveNote("mat", 22, 39, "aqui")).not.toThrow()
    expect(service.getNote("mat", 22, 39)?.text).toBe("aqui")
  })

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  describe("when the browser will not keep what is written", () => {
    it("says so, and stops saying so once a write succeeds", () => {
      const service = makeService()
      const seen: boolean[] = []
      service.saveFailed$.subscribe((failed) => seen.push(failed))
      const setItem = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceededError")
        })

      service.saveNote("mat", 22, 39, "aqui")
      expect(service.saveFailed).toBe(true)
      // The note is still there, for this page.
      expect(service.getNote("mat", 22, 39)?.text).toBe("aqui")

      setItem.mockRestore()
      service.saveNote("mat", 22, 39, "aqui, de novo")
      expect(service.saveFailed).toBe(false)
      expect(seen).toEqual([false, true, false])
    })

    it("says so too when there is no storage at all", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("SecurityError")
      })
      const service = makeService()

      service.saveNote("mat", 22, 39, "aqui")

      expect(service.saveFailed).toBe(true)
    })
  })

  describe("asking the browser to keep the notes", () => {
    it("asks once, after the first write that is kept", async () => {
      const persist = vi.fn().mockResolvedValue(true)
      vi.stubGlobal("navigator", { ...navigator, storage: { persist } })
      const service = makeService()

      service.saveNote("mat", 22, 39, "primeira")
      service.saveNote("mat", 22, 40, "segunda")

      expect(persist).toHaveBeenCalledTimes(1)
    })

    it("does not ask when nothing was kept", () => {
      const persist = vi.fn().mockResolvedValue(true)
      vi.stubGlobal("navigator", { ...navigator, storage: { persist } })
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError")
      })

      makeService().saveNote("mat", 22, 39, "aqui")

      expect(persist).not.toHaveBeenCalled()
    })

    it("carries on where the browser has no storage manager, or it refuses", () => {
      vi.stubGlobal("navigator", {
        ...navigator,
        storage: {
          persist: () => {
            throw new Error("not allowed")
          },
        },
      })

      expect(() => makeService().saveNote("mat", 22, 39, "aqui")).not.toThrow()
    })
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

  it("does not count saving the same text again as an edit", () => {
    const service = makeService()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1000))
    service.saveNote("mat", 22, 39, "igual")
    vi.setSystemTime(new Date(5000))
    service.saveNote("mat", 22, 39, "igual ")
    vi.useRealTimers()

    expect(service.getNote("mat", 22, 39)?.updatedAt).toBe(1000)
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
    expect(service.getNote("mat", 22, 40)?.text).toBe("vizinho")
    expect(service.getNote("mat", 23, 39)?.text).toBe("outro capítulo")
    expect(service.getNote("mrk", 22, 39)?.text).toBe("outro livro")
  })

  it("lists a chapter's notes in verse order", async () => {
    const service = makeService()
    service.saveNote("mat", 22, 40, "quarenta")
    service.saveNote("mat", 22, 12, "doze")
    service.saveNote("mat", 23, 1, "outro capítulo")

    const notes = await firstValueFrom(service.notesForChapter("mat", 22))

    expect(notes.map((note) => note.verse)).toEqual([12, 40])
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
        { bookId: "mat", chapter: 22, verse: 41, text: "sem data" },
      ]),
    )

    const service = makeService()
    expect(service.getNote("mat", 22, 39)?.text).toBe("boa")
    expect(service.getNote("mat", 22, 40)).toBeUndefined()
    // No updatedAt: the entry would read back as a note with an undefined
    // timestamp, so it is not one.
    expect(service.getNote("mat", 22, 41)).toBeUndefined()
  })

  it("keeps notes another tab wrote while this one was open", () => {
    const service = makeService()
    service.saveNote("mat", 22, 39, "desta janela")

    // A second tab, sharing the same storage, adds its own note.
    const fromOtherTab = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    fromOtherTab.push({
      bookId: "mat",
      chapter: 22,
      verse: 12,
      text: "da outra janela",
      updatedAt: 2,
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fromOtherTab))

    service.saveNote("mat", 22, 40, "mais uma")

    const stored: VerseNote[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    )
    expect(stored.map((note) => note.verse).sort((a, b) => a - b)).toEqual([
      12, 39, 40,
    ])
  })
})
