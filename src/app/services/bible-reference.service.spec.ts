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

  // Only the verse numbers were compared, so a same-verse range kept its
  // suffixes in the order the user typed them.
  it('orders suffixes within one verse "Jo 3,20b-20a"', () => {
    const out = service.extract("Jo 3,20b-20a")
    expect(out.length).toBe(1)
    expect(out[0].verses).toEqual([
      { type: "range", start: 20, end: 20, startPart: "a", endPart: "b" },
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

  it('normalizes reversed ranges keeping parts with their verse, "John 3,20b-18a"', () => {
    const input = "John 3,20b-18a"
    const out = service.extract(input)
    expect(out.length).toBe(1)
    expect(out[0].verses).toEqual([
      {
        type: "range",
        start: 18,
        end: 20,
        startPart: "a",
        endPart: "b",
      } as VerseReference,
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

  // References as liturgical leaflets and the edition's own notes write them.
  describe("verse lists and verse parts", () => {
    beforeEach(() => {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        providers: [
          {
            provide: BookService,
            useValue: {
              books$: { subscribe: (fn: () => void) => fn() },
              getBooks: () => [
                { abrv: "Sl", shortName: "Salmos", name: "Salmos", id: "psa" },
                { abrv: "Lc", shortName: "Lucas", name: "Lucas", id: "luk" },
                { abrv: "Est", shortName: "Ester", name: "Ester", id: "est" },
                { abrv: "Jo", shortName: "João", name: "João", id: "jhn" },
                {
                  abrv: "2 Cor",
                  shortName: "2 Coríntios",
                  name: "2 Coríntios",
                  id: "2co",
                },
              ],
            },
          },
        ],
      })
      service = TestBed.inject(BibleReferenceService)
    })

    it('joins verse ranges with dots: "Sl 94,1-2.6-7.8-9"', () => {
      const out = service.extract(
        "Salmo responsorial: Sl 94,1-2.6-7.8-9 (R. 8)",
      )
      expect(out.length).toBe(1)
      expect(out[0].match).toBe("Sl 94,1-2.6-7.8-9")
      expect(out[0].verses).toEqual([
        { type: "range", start: 1, end: 2 },
        { type: "range", start: 6, end: 7 },
        { type: "range", start: 8, end: 9 },
      ])
    })

    it('takes spaced dots too: "Sl 78,1-2. 3-5. 8. 9"', () => {
      const out = service.extract("Sl 78,1-2. 3-5. 8. 9 (R. 9b)")
      expect(out.length).toBe(1)
      expect(out[0].verses).toEqual([
        { type: "range", start: 1, end: 2 },
        { type: "range", start: 3, end: 5 },
        { type: "single", verse: 8 },
        { type: "single", verse: 9 },
      ])
    })

    // Before, the tail of "Lc 1,5.8.23" became a link of its own to Lc 8,23.
    it('keeps a dotted list in the notes as one reference: "Lc 1,5.8.23"', () => {
      const out = service.extract("ver Lc 1,5.8.23; 2,1")
      expect(out.map((ref) => ref.match)).toEqual(["Lc 1,5.8.23", "2,1"])
      expect(out[0].verses).toEqual([
        { type: "single", verse: 5 },
        { type: "single", verse: 8 },
        { type: "single", verse: 23 },
      ])
    })

    it('reads two-letter verse parts: "Sl 115,12-13.15-16bc.17-18"', () => {
      const out = service.extract("Sl 115,12-13.15-16bc.17-18")
      expect(out.length).toBe(1)
      expect(out[0].verses).toEqual([
        { type: "range", start: 12, end: 13 },
        { type: "range", start: 15, end: 16, endPart: "c" },
        { type: "range", start: 17, end: 18 },
      ])
      const single = service.extract("Sl 23,6bc")[0]
      expect(single.verses).toEqual([
        { type: "range", start: 6, startPart: "b", end: 6, endPart: "c" },
      ])
    })

    it('reads a lettered verse: "Est 4,17a"', () => {
      expect(service.extract("Est 4,17a")[0].verses).toEqual([
        { type: "single", verse: 17, part: "a" },
      ])
    })

    it("doesn't swallow the number of the next book after a spaced dot", () => {
      const out = service.extract("Jo 3,16. 2 Cor 5,17")
      expect(out.map((ref) => ref.match)).toEqual(["Jo 3,16", "2 Cor 5,17"])
      expect(out[0].verses).toEqual([{ type: "single", verse: 16 }])
    })

    // "20-21.29" read as chapter 15 verse 20 to chapter 21 verse 29.
    it('keeps a dot after a range for verses: "Lc 15,20-21.29"', () => {
      const out = service.extract("Lc 15,20-21.29")
      expect(out.length).toBe(1)
      expect(out[0].crossChapter).toBeUndefined()
      expect(out[0].verses).toEqual([
        { type: "range", start: 20, end: 21 },
        { type: "single", verse: 29 },
      ])
    })

    // Before, any words after a spaced list cut it at its first range.
    it("keeps a spaced list whole when words follow it", () => {
      const out = service.extract("Sl 78,1-2. 3-5 neste salmo")
      expect(out.length).toBe(1)
      expect(out[0].match).toBe("Sl 78,1-2. 3-5")
      expect(out[0].verses).toEqual([
        { type: "range", start: 1, end: 2 },
        { type: "range", start: 3, end: 5 },
      ])
    })

    it("leaves a new chapter after a dot to its own reference", () => {
      const out = service.extract("Jo 3,16.4,5")
      expect(out[0].match).toBe("Jo 3,16")
      expect(out[1].chapter).toBe(4)
    })

    // Before, only the first verse of a tight comma list was linked.
    it('keeps a tight comma list whole: "Lc 5,3,4,5"', () => {
      const out = service.extract("Lc 5,3,4,5")
      expect(out.length).toBe(1)
      expect(out[0].match).toBe("Lc 5,3,4,5")
      expect(out[0].verses).toEqual([
        { type: "single", verse: 3 },
        { type: "single", verse: 4 },
        { type: "single", verse: 5 },
      ])
    })

    // Before, "1-2" lost its "-2" when a comma followed it.
    it('takes a range in a comma list whole: "Lc 5,3,1-2,5"', () => {
      const out = service.extract("Lc 5,3,1-2,5")
      expect(out[0].verses).toEqual([
        { type: "single", verse: 3 },
        { type: "range", start: 1, end: 2 },
        { type: "single", verse: 5 },
      ])
    })
  })
})
