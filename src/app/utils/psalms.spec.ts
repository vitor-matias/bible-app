import {
  isAmbiguousPsalmNumber,
  liturgicalPsalmNumber,
  parsePsalmPair,
  psalmFromLiturgical,
} from "./psalms"

// The table in the edition's introduction to the Psalms.
describe("psalm numbering", () => {
  it("gives the liturgical number where it differs", () => {
    expect(liturgicalPsalmNumber(23)).toBe("22")
    expect(liturgicalPsalmNumber(95)).toBe("94")
    expect(liturgicalPsalmNumber(10)).toBe("9")
    expect(liturgicalPsalmNumber(114)).toBe("113")
    expect(liturgicalPsalmNumber(115)).toBe("113")
    expect(liturgicalPsalmNumber(116)).toBe("114-115")
    expect(liturgicalPsalmNumber(117)).toBe("116")
    expect(liturgicalPsalmNumber(146)).toBe("145")
    expect(liturgicalPsalmNumber(147)).toBe("146-147")
  })

  it("gives none where both numberings agree", () => {
    for (const psalm of [1, 8, 9, 148, 150]) {
      expect(liturgicalPsalmNumber(psalm)).withContext(`${psalm}`).toBeNull()
    }
  })

  it("finds where a liturgical psalm begins in this edition", () => {
    expect(psalmFromLiturgical(22)).toEqual({ psalm: 23, verse: 1 })
    expect(psalmFromLiturgical(94)).toEqual({ psalm: 95, verse: 1 })
    expect(psalmFromLiturgical(9)).toEqual({ psalm: 9, verse: 1 })
    expect(psalmFromLiturgical(113)).toEqual({ psalm: 114, verse: 1 })
    expect(psalmFromLiturgical(114)).toEqual({ psalm: 116, verse: 1 })
    expect(psalmFromLiturgical(115)).toEqual({ psalm: 116, verse: 10 })
    expect(psalmFromLiturgical(116)).toEqual({ psalm: 117, verse: 1 })
    expect(psalmFromLiturgical(146)).toEqual({ psalm: 147, verse: 1 })
    expect(psalmFromLiturgical(147)).toEqual({ psalm: 147, verse: 12 })
    expect(psalmFromLiturgical(150)).toEqual({ psalm: 150, verse: 1 })
    expect(psalmFromLiturgical(151)).toBeNull()
  })

  it("round-trips every psalm the two numberings share", () => {
    for (let psalm = 1; psalm <= 150; psalm++) {
      const liturgical = liturgicalPsalmNumber(psalm)
      const first = Number((liturgical ?? String(psalm)).split("-")[0])
      expect(psalmFromLiturgical(first)?.psalm)
        .withContext(`Psalm ${psalm}`)
        .toBe(psalm === 10 ? 9 : psalm === 115 ? 114 : psalm)
    }
  })

  it("knows which bare numbers could mean two psalms", () => {
    expect(isAmbiguousPsalmNumber(94)).toBeTrue()
    expect(isAmbiguousPsalmNumber(23)).toBeTrue()
    expect(isAmbiguousPsalmNumber(1)).toBeFalse()
    expect(isAmbiguousPsalmNumber(9)).toBeFalse()
    expect(isAmbiguousPsalmNumber(147)).toBeFalse()
    expect(isAmbiguousPsalmNumber(150)).toBeFalse()
  })

  describe("a psalm cited with both numbers", () => {
    it("opens this edition's number, whichever comes first", () => {
      expect(parsePsalmPair("Sl 94 (95), 1-2.6-7.8-9")).toEqual({
        psalm: 95,
        book: "Sl",
        rest: ", 1-2.6-7.8-9",
      })
      expect(parsePsalmPair("Salmo 23 (22)")).toEqual({
        psalm: 23,
        book: "Salmo",
        rest: "",
      })
      expect(parsePsalmPair("Sl 115 (116B), 12-13")?.psalm).toBe(116)
      expect(parsePsalmPair("Sl 113 (114)")?.psalm).toBe(114)
      expect(parsePsalmPair("Sl 1 (1)")?.psalm).toBe(1)
    })

    it("ignores numbers that don't name the same psalm", () => {
      expect(parsePsalmPair("Sl 94 (97)")).toBeNull()
      expect(parsePsalmPair("Sl 94")).toBeNull()
      expect(parsePsalmPair("Jo 3,16")).toBeNull()
    })
  })
})
