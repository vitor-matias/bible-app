import { isVerseAddress } from "./verse-record-store"

describe("isVerseAddress", () => {
  const at = (bookId: unknown, chapter: unknown, verse: unknown) =>
    isVerseAddress({ bookId, chapter, verse })

  it("accepts a verse of a chapter", () => {
    expect(at("mat", 5, 3)).toBe(true)
  })

  // Chapter 0 is a book's introduction; verse 0 is a chapter's front matter,
  // which nothing is written on.
  it("accepts a book's introduction, but not a chapter's front matter", () => {
    expect(at("mat", 0, 1)).toBe(true)
    expect(at("mat", 5, 0)).toBe(false)
  })

  it("refuses a place no verse can be", () => {
    expect(at("", 5, 3)).toBe(false)
    expect(at("xyz", -1, 2)).toBe(false)
    expect(at("xyz", 5, 2.5)).toBe(false)
    expect(at("mat", 1.5, 1)).toBe(false)
    expect(at("mat", 5, -3)).toBe(false)
    expect(at("mat", Number.MAX_SAFE_INTEGER + 1, 1)).toBe(false)
  })

  it("refuses what is not a number or a book", () => {
    expect(at(5, 5, 3)).toBe(false)
    expect(at("mat", "5", 3)).toBe(false)
    expect(at("mat", 5, null)).toBe(false)
    expect(at(undefined, undefined, undefined)).toBe(false)
  })
})
