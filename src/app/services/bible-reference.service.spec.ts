import { TestBed } from "@angular/core/testing"
import {
  BibleReferenceService,
  type VerseReference,
} from "./bible-reference.service"
import { BookService } from "./book.service"

describe("BibleReferenceService", () => {
  let service: BibleReferenceService

  beforeEach(() => {
    const mockBookService = {
      books$: { subscribe: (fn: () => void) => fn() }, // Immediate subscription
      getBooks: () => [
        { abrv: "Gn", shortName: "Genesis", name: "Genesis", id: "gen" },
        { abrv: "Ex", shortName: "Exodus", name: "Exodus", id: "exo" },
        { abrv: "Mt", shortName: "Mateus", name: "Mateus", id: "mat" },
        { abrv: "Jo", shortName: "John", name: "John", id: "joh" },
        { abrv: "1Jo", shortName: "1 John", name: "1 John", id: "1jo" },
        {
          abrv: "Ct",
          shortName: "Song of Songs",
          name: "Song of Songs",
          id: "sng",
        },
        { abrv: "Ap", shortName: "Apoc", name: "Apocalipse", id: "rev" },
      ],
    }

    TestBed.configureTestingModule({
      providers: [{ provide: BookService, useValue: mockBookService }],
    })
    service = TestBed.inject(BibleReferenceService)
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it('extracts a simple reference "John 3,16"', () => {
    const input = "Famous verse: John 3,16."
    const out = service.extract(input)
    expect(out.length).toBe(1)
    const r = out[0]
    expect(r.book).toBe("John")
    expect(r.chapter).toBe(3)
    expect(r.verses).toEqual([{ type: "single", verse: 16 } as VerseReference])
    expect(r.match).toBe("John 3,16")
  })

  it('handles book number prefixes "1 John 4,7\u20138, 12"', () => {
    const input = "Read 1 John 4,7\u20138, 12 together."
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

  it('supports hyphen range and comma list "Genesis 1,1-3;2,4"', () => {
    const input = "Genesis 1,1-3; 2,4"
    const out = service.extract(input)
    expect(out.length).toBe(2)
    const r = out[0]
    expect(r.book).toBe("Genesis")
    expect(r.chapter).toBe(1)
    expect(r.verses).toEqual([
      { type: "range", start: 1, end: 3 },
    ] as VerseReference[])
    const r2 = out[1]
    expect(r2.book).toBe("Genesis")
    expect(r2.chapter).toBe(2)
    expect(r2.verses).toEqual([
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
      "Refs: John 3,16; 1 John 4,7\u20138, 12; Apoc 21,1 and Genesis 1,1-3."
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
    const input = "John 3,10-7"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].verses).toEqual([{ type: "range", start: 7, end: 10 }])
  })

  it("includes index of the match", () => {
    const input = "abc John 3,16 def"
    const out = service.extract(input)
    expect(out[0].index).toBe(4) // 'J' starts at index 4
  })

  it("handles cross-chapter ranges", () => {
    const input = "Gn 38,1-39,30"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].book).toBe("Gn")
    expect(out[0].chapter).toBe(38)
    expect(out[0].crossChapter).toEqual({
      type: "crossChapterRange",
      startChapter: 38,
      startVerse: 1,
      endChapter: 39,
      endVerse: 30,
      startPart: undefined,
      endPart: undefined,
    })
  })

  it('extracts verse parts like "John 3,16a"', () => {
    const input = "John 3,16a"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].verses).toEqual([
      { type: "single", verse: 16, part: "a" } as VerseReference,
    ])
  })

  it('extracts range with verse parts like "John 3,16a-17b"', () => {
    const input = "John 3,16a-17b"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].verses).toEqual([
      {
        type: "range",
        start: 16,
        end: 17,
        startPart: "a",
        endPart: "b",
      } as VerseReference,
    ])
  })

  it('extracts verse lists "John 3,16, 18-20"', () => {
    const input = "John 3,16, 18-20"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].verses).toEqual([
      { type: "single", verse: 16 },
      { type: "range", start: 18, end: 20 },
    ])
  })

  it('extracts implicit references with context "John 3,16-17; 4,1-5"', () => {
    const input = "John 3,16-17; 4,1-5"
    const out = service.extract(input)
    expect(out.length).toBe(2)
    expect(out[0].chapter).toBe(3)
    expect(out[1].chapter).toBe(4)
    expect(out[1].book).toBe("John")
    expect(out[1].verses).toEqual([
      { type: "range", start: 1, end: 5 } as VerseReference,
    ])
  })

  it('extracts tail chapter only "; 12"', () => {
    const input = "John 3,16; 12"
    const out = service.extract(input)
    expect(out.length).toBe(2)
    expect(out[1].chapter).toBe(12)
    expect(out[1].book).toBe("John")
  })

  it('extracts verse-only shorthand "v. 12" with current context', () => {
    const input = "Read v. 12 and v. 14-15"
    const out = service.extract(input, "John", 3)
    expect(out.length).toBe(2)
    expect(out[0].book).toBe("John")
    expect(out[0].chapter).toBe(3)
    expect(out[0].verses).toEqual([
      { type: "single", verse: 12 } as VerseReference,
    ])
    expect(out[1].verses).toEqual([
      { type: "range", start: 14, end: 15 } as VerseReference,
    ])
  })

  it("extracts implicit cross-chapter", () => {
    const input = "Gn 38,1-39,30 and 40,1-41,30"
    const out = service.extract(input)
    expect(out.length).toBe(2)
    expect(out[1].book).toBe("Gn")
    expect(out[1].crossChapter).toEqual({
      type: "crossChapterRange",
      startChapter: 40,
      startVerse: 1,
      endChapter: 41,
      endVerse: 30,
      startPart: undefined,
      endPart: undefined,
    })
  })

  it("extracts cross-chapter ranges with verse parts", () => {
    const input = "Gn 38,1a-39,30b"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].book).toBe("Gn")
    expect(out[0].chapter).toBe(38)
    expect(out[0].crossChapter).toEqual({
      type: "crossChapterRange",
      startChapter: 38,
      startVerse: 1,
      startPart: "a",
      endChapter: 39,
      endVerse: 30,
      endPart: "b",
    })
  })

  it("extracts reference using book id (like gen)", () => {
    const input = "Read gen 1,1 and exo 2,2"
    const out = service.extract(input)
    expect(out.length).toBe(2)
    expect(out[0].book.toLowerCase()).toBe("gen")
    expect(out[0].chapter).toBe(1)
    expect(out[0].verses).toEqual([
      { type: "single", verse: 1 } as VerseReference,
    ])
    expect(out[1].book.toLowerCase()).toBe("exo")
    expect(out[1].chapter).toBe(2)
    expect(out[1].verses).toEqual([
      { type: "single", verse: 2 } as VerseReference,
    ])
  })
})
