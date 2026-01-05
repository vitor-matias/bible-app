import { TestBed } from "@angular/core/testing"
import {
  BibleReference,
  BibleReferenceService,
  type VerseReference,
} from "./bible-reference.service"

describe("BibleReferenceService", () => {
  let service: BibleReferenceService

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(BibleReferenceService)
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it('extracts a simple reference "John 3:16"', () => {
    const input = "Famous verse: John 3:16."
    const out = service.extract(input)
    expect(out.length).toBe(1)
    const r = out[0]
    expect(r.book).toBe("John")
    expect(r.chapter).toBe(3)
    expect(r.verses).toEqual([{ type: "single", verse: 16 } as VerseReference])
    expect(r.match).toBe("John 3:16")
  })

  it('handles book number prefixes "1 John 4:7\u20138, 12"', () => {
    const input = "Read 1 John 4:7\u20138, 12 together."
    const out = service.extract(input)
    expect(out.length).toBe(1)
    const r = out[0]
    expect(r.book).toBe("1 John")
    expect(r.chapter).toBe(4)
    expect(r.verses).toEqual([
      { type: "range", start: 7, end: 8 },
      { type: "single", verse: 12 },
    ] as VerseReference[])
  })

  it('supports hyphen range and comma list "Genesis 1:1-3; 2,4"', () => {
    const input = "Genesis 1:1-3; 2,4"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    const r = out[0]
    expect(r.book).toBe("Genesis")
    expect(r.chapter).toBe(1)
    expect(r.verses).toEqual([
      { type: "range", start: 1, end: 3 },
      { type: "single", verse: 2 },
      { type: "single", verse: 4 },
    ] as VerseReference[])
  })

  it('accepts European comma separator "Mt 5,3-12"', () => {
    const input = "Sermão da Montanha: Mt 5,3-12."
    const out = service.extract(input)
    expect(out.length).toBe(1)
    const r = out[0]
    expect(r.book).toBe("Mt")
    expect(r.chapter).toBe(5)
    expect(r.verses).toEqual([{ type: "range", start: 3, end: 12 }])
  })

  it('matches multi-word books "Song of Songs 2,1"', () => {
    const input = "Loved Song of Songs 2,1 today."
    const out = service.extract(input)
    expect(out.length).toBe(1)
    const r = out[0]
    expect(r.book).toBe("Song of Songs")
    expect(r.chapter).toBe(2)
    expect(r.verses).toEqual([{ type: "single", verse: 1 }])
  })

  it("ignores text without chapter/verse separator", () => {
    const input = "Salmo 23 é lindo." // no : , or . separator to verses
    const out = service.extract(input)
    expect(out.length).toBe(0)
  })

  it("handles multiple references in one string", () => {
    const input =
      "Refs: John 3:16; 1 John 4:7\u20138, 12; Apoc 21:1 and Genesis 1:1-3."
    const out = service.extract(input)
    expect(out.length).toBe(4)
    expect(out.map((r) => r.book)).toEqual([
      "John",
      "1 John",
      "Apoc",
      "Genesis",
    ])
  })

  it('normalizes reversed ranges (e.g., "10-7")', () => {
    const input = "John 3:10-7"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].verses).toEqual([{ type: "range", start: 7, end: 10 }])
  })

  it("includes index of the match", () => {
    const input = "abc John 3:16 def"
    const out = service.extract(input)
    expect(out[0].index).toBe(4) // 'J' starts at index 4
  })
})
