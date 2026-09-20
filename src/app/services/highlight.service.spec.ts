import { TestBed } from "@angular/core/testing"
import { HighlightService, type VerseHighlight } from "./highlight.service"

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

  it("reports a chapter's marks by verse", (done) => {
    const service = makeService()
    service.toggle("mat", 22, 37, "yellow")
    service.toggle("mat", 22, 39, "green")
    service.toggle("mat", 23, 1, "blue")

    service.forChapter("mat", 22).subscribe((marks) => {
      expect(marks.get(37)).toBe("yellow")
      expect(marks.get(39)).toBe("green")
      expect(marks.has(1)).toBeFalse()
      done()
    })
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
    spyOn(Storage.prototype, "setItem").and.throwError("denied")
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
    spyOn(Storage.prototype, "setItem").and.callFake(function (
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
})
