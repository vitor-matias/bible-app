import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import {
  HighlightService,
  isVerseHighlight,
  type VerseHighlight,
} from "./highlight.service"

const STORAGE_KEY = "verseHighlights"

function makeService(): HighlightService {
  TestBed.resetTestingModule()
  TestBed.configureTestingModule({ providers: [HighlightService] })
  return TestBed.inject(HighlightService)
}

describe("HighlightService", () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY))
  afterEach(() => localStorage.removeItem(STORAGE_KEY))

  it("marks a verse with the chosen colour", () => {
    const service = makeService()
    service.toggle("mat", 22, 37, "green")

    expect(service.colorFor("mat", 22, 37)).toBe("green")
  })

  it("survives a reload", () => {
    makeService().toggle("mat", 22, 37, "blue")

    expect(makeService().colorFor("mat", 22, 37)).toBe("blue")
  })

  it("takes the mark off when the same colour is chosen again", () => {
    const service = makeService()
    service.toggle("mat", 22, 37, "pink")
    service.toggle("mat", 22, 37, "pink")

    expect(service.colorFor("mat", 22, 37)).toBeUndefined()
  })

  it("changes colour rather than stacking marks", () => {
    const service = makeService()
    service.toggle("mat", 22, 37, "yellow")
    service.toggle("mat", 22, 37, "green")

    expect(service.colorFor("mat", 22, 37)).toBe("green")
    const stored: VerseHighlight[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    )
    expect(stored.length).toBe(1)
  })

  it("keeps verses, chapters and books apart", () => {
    const service = makeService()
    service.toggle("mat", 22, 37, "yellow")
    service.toggle("mat", 22, 38, "green")
    service.toggle("mat", 23, 37, "blue")
    service.toggle("mrk", 22, 37, "pink")

    expect(service.colorFor("mat", 22, 37)).toBe("yellow")
    expect(service.colorFor("mat", 22, 38)).toBe("green")
    expect(service.colorFor("mat", 23, 37)).toBe("blue")
    expect(service.colorFor("mrk", 22, 37)).toBe("pink")
  })

  it("reports a chapter's marks by verse", async () => {
    const service = makeService()
    service.toggle("mat", 22, 37, "yellow")
    service.toggle("mat", 22, 39, "green")
    service.toggle("mat", 23, 1, "blue")

    const marks = await firstValueFrom(service.forChapter("mat", 22))

    expect(marks.get(37)).toBe("yellow")
    expect(marks.get(39)).toBe("green")
    expect(marks.has(1)).toBe(false)
  })

  it("keeps marks another tab made while this one was open", () => {
    const service = makeService()
    service.toggle("mat", 22, 37, "yellow")

    const fromOtherTab = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    fromOtherTab.push({
      bookId: "mat",
      chapter: 22,
      verse: 12,
      color: "blue",
      updatedAt: 2,
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fromOtherTab))

    service.toggle("mat", 22, 40, "pink")

    const stored: VerseHighlight[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    )
    expect(stored.map((h) => h.verse).sort((a, b) => a - b)).toEqual([
      12, 37, 40,
    ])
  })

  it("drops stored entries that are not usable marks", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { bookId: "mat", chapter: 22, verse: 37, color: "green", updatedAt: 1 },
        {
          bookId: "mat",
          chapter: 22,
          verse: 38,
          color: "chartreuse",
          updatedAt: 1,
        },
        { bookId: "mat", chapter: 22, verse: 39, color: "green" },
        "lixo",
      ]),
    )

    const service = makeService()
    expect(service.colorFor("mat", 22, 37)).toBe("green")
    // An unknown colour has no styling behind it, and a mark with no
    // timestamp is not one this app wrote.
    expect(service.colorFor("mat", 22, 38)).toBeUndefined()
    expect(service.colorFor("mat", 22, 39)).toBeUndefined()
  })

  it("starts empty when storage holds something that is not JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")

    expect(makeService().colorFor("mat", 22, 37)).toBeUndefined()
  })

  it("keeps every mark of the session when storage refuses all writes", () => {
    // A privacy-mode browser: the probe write throws, so there is no storage.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })
    const service = makeService()

    service.toggle("mat", 22, 37, "yellow")
    service.toggle("mat", 22, 38, "green")
    expect(service.colorFor("mat", 22, 37)).toBe("yellow")
    expect(service.colorFor("mat", 22, 38)).toBe("green")

    // Clearing one mark must not take the rest with it.
    service.clear("mat", 22, 38)
    expect(service.colorFor("mat", 22, 37)).toBe("yellow")
  })

  it("keeps a mark whose write hit the quota when the next one is made", () => {
    const service = makeService()
    service.toggle("mat", 22, 36, "blue")

    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === STORAGE_KEY) throw new Error("QuotaExceededError")
      setItem.call(this, key, value)
    })

    service.toggle("mat", 22, 37, "yellow")
    service.toggle("mat", 22, 38, "green")

    expect(service.colorFor("mat", 22, 36)).toBe("blue")
    expect(service.colorFor("mat", 22, 37)).toBe("yellow")
    expect(service.colorFor("mat", 22, 38)).toBe("green")
  })

  it("follows a mark made in another tab", () => {
    const service = makeService()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { bookId: "mat", chapter: 22, verse: 37, color: "pink", updatedAt: 1 },
      ]),
    )
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }))

    expect(service.colorFor("mat", 22, 37)).toBe("pink")
  })

  describe("marks from a saved copy", () => {
    it("adds the marks it does not have, and keeps the newer on a verse both mark", () => {
      const service = makeService()
      vi.useFakeTimers()
      vi.setSystemTime(new Date(1000))
      service.toggle("mat", 22, 37, "yellow")
      service.toggle("mat", 22, 38, "green")
      vi.useRealTimers()

      const result = service.importHighlights([
        {
          bookId: "mat",
          chapter: 22,
          verse: 37,
          color: "pink",
          updatedAt: 2000,
        },
        {
          bookId: "mat",
          chapter: 22,
          verse: 38,
          color: "blue",
          updatedAt: 500,
        },
        { bookId: "mat", chapter: 22, verse: 39, color: "blue", updatedAt: 1 },
      ])

      expect(result).toEqual({ added: 1, replaced: 1, kept: 1 })
      expect(service.colorFor("mat", 22, 37)).toBe("pink")
      expect(service.colorFor("mat", 22, 38)).toBe("green")
      expect(service.colorFor("mat", 22, 39)).toBe("blue")
    })

    // "1e999" is Infinity in JSON: it would beat every mark in an import and
    // be written back as null, which is not a mark.
    it("is not a mark when its update time is out of range", () => {
      const mark = {
        bookId: "mat",
        chapter: 22,
        verse: 37,
        color: "pink",
        updatedAt: 1,
      }

      expect(isVerseHighlight(mark)).toBe(true)
      expect(
        isVerseHighlight({ ...mark, updatedAt: Number.POSITIVE_INFINITY }),
      ).toBe(false)
      expect(isVerseHighlight({ ...mark, updatedAt: Number.NaN })).toBe(false)
    })

    it("clears every mark on request", () => {
      const service = makeService()
      service.toggle("mat", 22, 37, "yellow")

      service.clearAll()

      expect(localStorage.getItem(STORAGE_KEY)).toBe("[]")
      expect(service.colorFor("mat", 22, 37)).toBeUndefined()
    })
  })
})
