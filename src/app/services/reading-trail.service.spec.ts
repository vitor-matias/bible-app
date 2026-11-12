import { TestBed } from "@angular/core/testing"
import { ReadingTrailService, type TrailEntry } from "./reading-trail.service"

function entry(bookId: string, chapter: number): TrailEntry {
  return {
    key: `${bookId}:${chapter}`,
    label: `${bookId} ${chapter}`,
    link: ["/", bookId, chapter],
  }
}

describe("ReadingTrailService", () => {
  let service: ReadingTrailService

  beforeEach(() => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ providers: [ReadingTrailService] })
    service = TestBed.inject(ReadingTrailService)
  })

  it("starts with nowhere to go back to", () => {
    expect(service.entries).toEqual([])
  })

  it("records each new place in the order the reader went", () => {
    service.visit(entry("mat", 22))
    service.visit(entry("luk", 14))
    service.visit(entry("mrk", 12))

    expect(service.entries.map((e) => e.key)).toEqual([
      "mat:22",
      "luk:14",
      "mrk:12",
    ])
  })

  it("keeps the way taken when the reader comes back to where they began", () => {
    service.visit(entry("mat", 22))
    service.visit(entry("luk", 14))
    service.visit(entry("mrk", 12))

    service.visit(entry("mat", 22))

    // A record of where the reader passed, not the shortest path to here:
    // going back to Matthew leaves Luke and Mark behind it.
    expect(service.entries.map((e) => e.key)).toEqual([
      "mat:22",
      "luk:14",
      "mrk:12",
      "mat:22",
    ])
  })

  it("folds a re-read of the chapter already open into that same step", () => {
    service.visit(entry("mat", 22))
    service.visit(entry("luk", 14))

    service.visit(entry("luk", 14))

    expect(service.entries.map((e) => e.key)).toEqual(["mat:22", "luk:14"])
  })

  it("does not grow when the same chapter is re-read", () => {
    service.visit(entry("mat", 22))
    service.visit(entry("mat", 22))

    expect(service.entries.length).toBe(1)
  })

  it("keeps the newest details when re-reading the current place", () => {
    service.visit(entry("mat", 22))
    service.visit({ ...entry("mat", 22), queryParams: { verseStart: 39 } })

    expect(service.entries[0].queryParams).toEqual({ verseStart: 39 })
  })

  it("forgets the oldest places rather than growing without end", () => {
    for (let chapter = 1; chapter <= 25; chapter++) {
      service.visit(entry("psa", chapter))
    }

    expect(service.entries.length).toBe(20)
    expect(service.entries[0].key).toBe("psa:6")
    expect(service.entries[19].key).toBe("psa:25")
  })

  it("emits the trail as it changes", () => {
    const seen: number[] = []
    service.entries$.subscribe((entries) => seen.push(entries.length))

    service.visit(entry("mat", 22))
    service.visit(entry("luk", 14))

    expect(seen).toEqual([0, 1, 2])
  })

  it("does not emit when clearing an already empty trail", () => {
    let emissions = 0
    service.entries$.subscribe(() => emissions++)

    service.clear()

    expect(emissions).toBe(1)
  })
})
