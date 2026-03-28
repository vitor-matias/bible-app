import {
  type BibleReference,
  BibleReferenceService,
  type CrossChapterRange,
} from "../../services/bible-reference.service"
import { getVerseQueryParams, parseReferences } from "./verse.utils"

describe("verse.utils", () => {
  describe("parseReferences", () => {
    let mockBibleRef: jasmine.SpyObj<BibleReferenceService>

    beforeEach(() => {
      mockBibleRef = jasmine.createSpyObj("BibleReferenceService", ["extract"])
    })

    it("should return the original text in an array when no references found", () => {
      mockBibleRef.extract.and.returnValue([])
      const result = parseReferences(mockBibleRef, "some plain text", "gen")
      expect(result).toEqual(["some plain text"])
    })

    it("should split text around a single reference", () => {
      const ref: BibleReference = {
        match: "Gn 1,1",
        index: 5,
        book: "gen",
        chapter: 1,
        verses: [{ type: "single", verse: 1 }],
      }
      mockBibleRef.extract.and.returnValue([ref])

      const result = parseReferences(mockBibleRef, "See: Gn 1,1 here", "gen")

      expect(result.length).toBe(3)
      expect(result[0]).toBe("See: ")
      expect(result[1]).toBe(ref)
      expect(result[2]).toBe(" here")
    })

    it("should handle reference at the start of text", () => {
      const ref: BibleReference = {
        match: "Gn 1,1",
        index: 0,
        book: "gen",
        chapter: 1,
      }
      mockBibleRef.extract.and.returnValue([ref])

      const result = parseReferences(mockBibleRef, "Gn 1,1 rest", "gen")

      expect(result.length).toBe(2)
      expect(result[0]).toBe(ref)
      expect(result[1]).toBe(" rest")
    })

    it("should handle reference at the end of text", () => {
      const ref: BibleReference = {
        match: "Gn 1,1",
        index: 5,
        book: "gen",
        chapter: 1,
      }
      mockBibleRef.extract.and.returnValue([ref])

      const result = parseReferences(mockBibleRef, "See: Gn 1,1", "gen")

      expect(result.length).toBe(2)
      expect(result[0]).toBe("See: ")
      expect(result[1]).toBe(ref)
    })

    it("should handle multiple references", () => {
      const ref1: BibleReference = {
        match: "Gn 1,1",
        index: 0,
        book: "gen",
        chapter: 1,
      }
      const ref2: BibleReference = {
        match: "Ex 2,3",
        index: 9,
        book: "exo",
        chapter: 2,
      }
      mockBibleRef.extract.and.returnValue([ref1, ref2])

      const result = parseReferences(mockBibleRef, "Gn 1,1 ; Ex 2,3 end", "gen")

      expect(result.length).toBe(4)
      expect(result[0]).toBe(ref1)
      expect(result[1]).toBe(" ; ")
      expect(result[2]).toBe(ref2)
      expect(result[3]).toBe(" end")
    })

    it("should pass the bookId to the extract method", () => {
      mockBibleRef.extract.and.returnValue([])
      parseReferences(mockBibleRef, "text", "psa")
      expect(mockBibleRef.extract).toHaveBeenCalledWith("text", "psa")
    })
  })

  describe("getVerseQueryParams", () => {
    it("should return null when no verses and no crossChapter provided", () => {
      expect(getVerseQueryParams()).toBeNull()
    })

    it("should return null when verses array is empty", () => {
      expect(getVerseQueryParams([])).toBeNull()
    })

    it("should return verseStart for a single verse", () => {
      const result = getVerseQueryParams([{ type: "single", verse: 5 }])
      expect(result).toEqual({ verseStart: 5 })
    })

    it("should return verseStart and verseEnd for a range verse", () => {
      const result = getVerseQueryParams([{ type: "range", start: 3, end: 7 }])
      expect(result).toEqual({ verseStart: 3, verseEnd: 7 })
    })

    it("should prioritize crossChapter over verses", () => {
      const crossChapter: CrossChapterRange = {
        type: "crossChapterRange",
        startChapter: 1,
        startVerse: 10,
        endChapter: 2,
        endVerse: 5,
      }
      const result = getVerseQueryParams(
        [{ type: "single", verse: 1 }],
        crossChapter,
      )
      expect(result).toEqual({ verseStart: 10 })
    })

    it("should return crossChapter verseStart when only crossChapter provided", () => {
      const crossChapter: CrossChapterRange = {
        type: "crossChapterRange",
        startChapter: 3,
        startVerse: 15,
        endChapter: 4,
        endVerse: 1,
      }
      const result = getVerseQueryParams(undefined, crossChapter)
      expect(result).toEqual({ verseStart: 15 })
    })

    it("should use only the first verse when multiple verses given", () => {
      const result = getVerseQueryParams([
        { type: "single", verse: 1 },
        { type: "single", verse: 5 },
      ])
      expect(result).toEqual({ verseStart: 1 })
    })
  })
})
