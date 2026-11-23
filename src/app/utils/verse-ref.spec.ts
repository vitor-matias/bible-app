import {
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

    it("keeps a number the chapter lacks, as before", () => {
      expect(resolveVerseKey(esterOne, { number: 99 })).toBe(99)
      expect(resolveVerseKey([], { number: 3 })).toBe(3)
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

    it("keeps the number where the chapter has nothing to go by", () => {
      expect(resolveVerseEndKey([], { number: 9 })).toBe(9)
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
