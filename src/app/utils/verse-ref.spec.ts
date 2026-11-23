import {
  chapterFirstRef,
  isAddition,
  parseVerseRef,
  printedNumber,
  resolveVerseEndKey,
  resolveVerseKey,
  verseRefValue,
} from "./verse-ref"

/** Ester 1 as the API stores it: addition A as keys 1-17, the chapter's own
 *  verses, printed 1-22, after it as keys 18-39. */
const esterOne: Pick<Verse, "number" | "numberLabel" | "supplement">[] = [
  { number: 0, numberLabel: "front" },
  ...Array.from({ length: 17 }, (_, i) => ({
    number: i + 1,
    numberLabel: `${i + 1}`,
    supplement: true,
  })),
  ...Array.from({ length: 22 }, (_, i) => ({
    number: i + 18,
    numberLabel: `${i + 1}`,
  })),
]

/** Ben Sira 1 as the API stores it: the prologue's eight lines, unflagged,
 *  labelled 1, 5, 10 ... 35 as keys 1-8, then the chapter's 1-30 as 9-38. */
const sirachOne: Pick<
  Verse,
  "number" | "numberLabel" | "supplement" | "bookId" | "chapterNumber"
>[] = [
  { number: 0, numberLabel: "0", bookId: "sir", chapterNumber: 1 },
  ...[1, 5, 10, 15, 20, 25, 30, 35].map((label, i) => ({
    number: i + 1,
    numberLabel: `${label}`,
    bookId: "sir",
    chapterNumber: 1,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    number: i + 9,
    numberLabel: `${i + 1}`,
    bookId: "sir",
    chapterNumber: 1,
  })),
]

describe("verse-ref", () => {
  describe("parseVerseRef", () => {
    it("reads a printed number and an addition's letter and number", () => {
      expect(parseVerseRef("16")).toEqual({ number: 16 })
      expect(parseVerseRef("A1")).toEqual({ number: 1, addition: true })
      expect(parseVerseRef("c30")).toEqual({ number: 30, addition: true })
      expect(parseVerseRef("16b")).toEqual({ number: 16 })
    })

    // /gn/1?verseStart=1&verseStart=2 gives the router an array.
    it("reads a parameter given twice as its first, and never throws", () => {
      expect(parseVerseRef(["1", "2"])).toEqual({ number: 1 })
      expect(parseVerseRef(["A2", "5"])).toEqual({ number: 2, addition: true })
      expect(parseVerseRef([])).toBeUndefined()
      expect(parseVerseRef(7)).toBeUndefined()
      expect(parseVerseRef({})).toBeUndefined()
    })

    it.each([null, undefined, "", "0", "abc", "AB1", "-3"])(
      "reads %j as no verse",
      (raw) => {
        expect(parseVerseRef(raw)).toBeUndefined()
      },
    )
  })

  describe("resolveVerseKey", () => {
    it("opens the chapter's own verse 1, not the addition's, for a bare 1", () => {
      expect(resolveVerseKey(esterOne, { number: 1 })).toBe(18)
      expect(resolveVerseKey(esterOne, { number: 22 })).toBe(39)
    })

    it("opens the addition's verse for a letter", () => {
      expect(resolveVerseKey(esterOne, { number: 1, addition: true })).toBe(1)
      expect(resolveVerseKey(esterOne, { number: 17, addition: true })).toBe(17)
    })

    it("lets the end of a range inherit the start's kind", () => {
      expect(resolveVerseKey(esterOne, { number: 5 }, true)).toBe(5)
      expect(resolveVerseKey(esterOne, { number: 5 }, false)).toBe(22)
    })

    it("answers by the number as it is where nothing is printed apart", () => {
      const plain = [
        { number: 0, numberLabel: "front" },
        { number: 1, numberLabel: "1" },
        { number: 2, numberLabel: "2" },
      ]
      expect(resolveVerseKey(plain, { number: 2 })).toBe(2)
      // A chapter cached before labels existed.
      expect(
        resolveVerseKey([{ number: 1 }, { number: 2 }], { number: 2 }),
      ).toBe(2)
    })

    it("keeps a number a chapter without additions lacks, as before", () => {
      const plain = [
        { number: 1, numberLabel: "1" },
        { number: 2, numberLabel: "2" },
      ]
      expect(resolveVerseKey(plain, { number: 99 })).toBe(99)
      expect(resolveVerseKey([], { number: 3 })).toBe(3)
    })

    // Where the numbers are apart, a missing one is the key of another verse.
    it("opens nothing for a number a chapter with additions lacks", () => {
      expect(resolveVerseKey(esterOne, { number: 30 })).toBeUndefined()
      expect(resolveVerseKey(esterOne, { number: 99 })).toBeUndefined()
      expect(
        resolveVerseKey(esterOne, { number: 20, addition: true }),
      ).toBeUndefined()
    })
  })

  describe("resolveVerseEndKey", () => {
    it("finds an end that is printed, as the start does", () => {
      expect(resolveVerseEndKey(esterOne, { number: 22 })).toBe(39)
      expect(resolveVerseEndKey(esterOne, { number: 5 }, true)).toBe(5)
    })

    it("runs a range past the last verse to the last one of its kind", () => {
      // "Est 1,20-23" in a chapter printed to 22: not 23, which falls before
      // the start's stored 37.
      expect(resolveVerseEndKey(esterOne, { number: 23 })).toBe(39)
      expect(resolveVerseEndKey(esterOne, { number: 30 }, true)).toBe(17)
    })

    it("ends a range at the verse before one the chapter omits", () => {
      // Mt 17 as the translation has it: 20, then 22.
      const omitted = [20, 22, 23].map((n) => ({
        number: n,
        numberLabel: `${n}`,
      }))
      expect(resolveVerseEndKey(omitted, { number: 21 })).toBe(20)
      expect(resolveVerseEndKey(omitted, { number: 23 })).toBe(23)
    })

    it("keeps the number where the chapter has nothing to go by", () => {
      expect(resolveVerseEndKey([], { number: 9 })).toBe(9)
    })
  })

  describe("Ben Sira's prologue, numbered apart without a flag", () => {
    it("opens the chapter's own verse for a printed number the prologue shares", () => {
      expect(resolveVerseKey(sirachOne, { number: 5 })).toBe(13)
      expect(resolveVerseKey(sirachOne, { number: 30 })).toBe(38)
      expect(resolveVerseKey(sirachOne, { number: 1 })).toBe(9)
      expect(resolveVerseKey(sirachOne, { number: 2 })).toBe(10)
    })

    it("opens a prologue line by its letter", () => {
      expect(resolveVerseKey(sirachOne, { number: 5, addition: true })).toBe(2)
      expect(resolveVerseKey(sirachOne, { number: 35, addition: true })).toBe(8)
    })

    it("ends a range in the chapter, not at a prologue line", () => {
      expect(resolveVerseEndKey(sirachOne, { number: 10 })).toBe(18)
    })

    it("writes a link that opens the verse a result is", () => {
      // The prologue's first line is labelled 1, as is the chapter's.
      expect(verseRefValue(sirachOne[1], "sir", 1)).toBe("P1")
      expect(resolveVerseKey(sirachOne, { number: 1, addition: true })).toBe(1)
      // Search hit Sir 1,5 (stored 13) and a prologue line (stored 2).
      expect(verseRefValue(sirachOne[13], "sir", 1)).toBe(5)
      expect(verseRefValue(sirachOne[2], "sir", 1)).toBe("P5")
      for (const verse of sirachOne.slice(1)) {
        const ref = parseVerseRef(`${verseRefValue(verse, "sir", 1)}`)
        expect(ref && resolveVerseKey(sirachOne, ref)).toBe(verse.number)
      }
    })

    // Zechariah 3 stores "8-9" as key 8 and prints "10" under key 9: a label
    // ahead of its key is no sign of an addition.
    it("does not take a merged verse's successor for an addition", () => {
      const zechariah = [
        { number: 8, numberLabel: "8-9", bookId: "zec", chapterNumber: 3 },
        { number: 9, numberLabel: "10", bookId: "zec", chapterNumber: 3 },
      ]
      expect(isAddition(zechariah[1])).toBe(false)
      expect(resolveVerseKey(zechariah, { number: 10 })).toBe(9)
      expect(verseRefValue(zechariah[1], "zec", 3)).toBe(10)
    })

    it("tells the prologue from the chapter, and an addition from neither", () => {
      expect(isAddition(sirachOne[2])).toBe(true)
      expect(isAddition(sirachOne[13])).toBe(false)
      expect(isAddition({ number: 3, numberLabel: "3" })).toBe(false)
      expect(
        isAddition({ number: 3, numberLabel: "3", supplement: true }),
      ).toBe(true)
    })
  })

  describe("chapterFirstRef", () => {
    it("names the verse the chapter's top opens at", () => {
      expect(chapterFirstRef("est", 1)).toBe("A1")
      expect(chapterFirstRef("sir", 1)).toBe("P1")
      expect(chapterFirstRef("est", 5)).toBe(1)
      expect(chapterFirstRef("gen", 1)).toBe(1)
      expect(
        resolveVerseKey(esterOne, parseVerseRef("A1") ?? { number: 0 }),
      ).toBe(1)
    })
  })

  describe("verseRefValue", () => {
    it("writes the printed number of a chapter verse, not its stored one", () => {
      expect(verseRefValue(esterOne[18], "est", 1)).toBe(1)
    })

    it("writes an addition's letter by the chapter it is in", () => {
      expect(verseRefValue(esterOne[1], "est", 1)).toBe("A1")
      expect(
        verseRefValue(
          { number: 14, numberLabel: "2", supplement: true },
          "est",
          3,
        ),
      ).toBe("B2")
      expect(
        verseRefValue(
          { number: 3, numberLabel: "3", supplement: true },
          "est",
          10,
        ),
      ).toBe("F3")
    })

    it("round-trips through a link", () => {
      for (const verse of esterOne.slice(1)) {
        const ref = parseVerseRef(`${verseRefValue(verse, "est", 1)}`)
        expect(ref && resolveVerseKey(esterOne, ref)).toBe(verse.number)
      }
    })
  })

  it("printedNumber falls back to the stored number", () => {
    expect(printedNumber({ number: 7 })).toBe(7)
    expect(printedNumber({ number: 18, numberLabel: "1" })).toBe(1)
    expect(printedNumber({ number: 0, numberLabel: "front" })).toBe(0)
  })
})
