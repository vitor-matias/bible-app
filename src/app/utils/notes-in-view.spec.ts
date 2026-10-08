import { notesInView, type PlacedVerse } from "./notes-in-view"

describe("notesInView", () => {
  const verse = (number: number, notes: boolean): Verse =>
    ({
      bookId: "mat",
      chapterNumber: 5,
      number,
      text: [
        { type: "text", text: "…" },
        ...(notes
          ? [{ type: "footnote", text: "nota", reference: `${number}.` }]
          : []),
      ],
    }) as Verse
  // One verse per 100 px, from the top of the page.
  const placed = (verses: Verse[], scroll = 0): PlacedVerse[] =>
    verses.map((v, index) => ({
      verse: v,
      top: index * 100 - scroll,
      bottom: index * 100 + 90 - scroll,
      left: 16,
      right: 386,
    }))
  const band = { top: 120, bottom: 790, width: 402 }
  const numbers = (verses: Verse[]) => verses.map((v) => v.number)

  it("gives the notes of the verses on screen, in order", () => {
    const verses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => verse(n, n !== 4))
    // Verses 2 to 8 are on screen (tops 100..700), verse 4 has no notes.
    expect(numbers(notesInView(placed(verses), band))).toEqual([
      2, 3, 5, 6, 7, 8,
    ])
  })

  it("leaves out verses under the bars", () => {
    const verses = [1, 2, 3].map((n) => verse(n, true))
    // Verse 1 ends at 90, under the top bar (120).
    expect(numbers(notesInView(placed(verses), band))).toEqual([2, 3])
  })

  it("gives the last verse with notes above the screen when none is on it", () => {
    const verses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) =>
      verse(n, n === 1 || n === 2),
    )
    // Scrolled so verses 4 to 10 fill the screen.
    expect(numbers(notesInView(placed(verses, 300), band))).toEqual([2])
  })

  it("gives the next one below when there is none above", () => {
    const verses = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => verse(n, n === 9))
    expect(numbers(notesInView(placed(verses), band))).toEqual([9])
  })

  // Paged mode: the other pages sit beside the screen, not above or below.
  it("leaves out verses on other pages", () => {
    const verses = [1, 2].map((n) => verse(n, true))
    const pages = placed(verses).map((p, i) =>
      i === 1 ? { ...p, left: 418, right: 788 } : p,
    )
    pages[0] = { ...pages[0], top: 200, bottom: 290 }
    pages[1] = { ...pages[1], top: 200, bottom: 290 }
    expect(numbers(notesInView(pages, band))).toEqual([1])
  })

  // Before, nothing opened when the notes were on a later page.
  it("looks to the pages beside the screen in page-by-page mode", () => {
    const verses = [1, 2, 3].map((n) => verse(n, n === 3))
    const pages: PlacedVerse[] = [
      { verse: verses[0], top: 200, bottom: 290, left: 16, right: 386 },
      { verse: verses[1], top: 300, bottom: 390, left: 16, right: 386 },
      { verse: verses[2], top: 200, bottom: 290, left: 820, right: 1190 },
    ]
    expect(numbers(notesInView(pages, band))).toEqual([3])

    // Verse 1 on the page before, with notes; 2 and 3 on screen, without.
    const earlier = [1, 2, 3].map((n) => verse(n, n === 1))
    const previous: PlacedVerse[] = [
      { verse: earlier[0], top: 200, bottom: 290, left: -790, right: -420 },
      { verse: earlier[1], top: 200, bottom: 290, left: 16, right: 386 },
      { verse: earlier[2], top: 300, bottom: 390, left: 16, right: 386 },
    ]
    expect(numbers(notesInView(previous, band))).toEqual([1])
  })

  it("gives nothing for a chapter without notes", () => {
    const verses = [1, 2].map((n) => verse(n, false))
    expect(notesInView(placed(verses), band)).toEqual([])
  })
})
