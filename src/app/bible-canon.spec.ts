import {
  CLUSTER_INTROS,
  NEW_TESTAMENT_GROUPS,
  nextCanonBook,
  OLD_TESTAMENT_GROUPS,
  withIntros,
} from "./bible-canon"

describe("bible canon", () => {
  const groups = [...OLD_TESTAMENT_GROUPS, ...NEW_TESTAMENT_GROUPS]
  const ids = groups.flatMap((group) => group.books)

  // BookSelectorComponent.getBook matches on book.id exactly, so an id that
  // does not resolve drops that book from the picker silently rather than
  // failing. These pin the shape of the list; whether each id matches the live
  // API is checked end to end, where real book data is available.
  it("lists the 73 canonical books, once each", () => {
    expect(ids.length).toBe(73)
    expect(new Set(ids).size).toBe(73)
  })

  it("uses ids in the form the lookup expects", () => {
    const malformed = ids.filter((id) => id !== id.trim().toLowerCase() || !id)
    expect(malformed).toEqual([])
  })

  it("gives every group a name and at least one book", () => {
    expect(groups.filter((group) => !group.name.trim())).toEqual([])
    expect(groups.filter((group) => group.books.length === 0)).toEqual([])
  })

  it("keeps the testaments separate", () => {
    const oldIds = new Set(OLD_TESTAMENT_GROUPS.flatMap((g) => g.books))
    const shared = NEW_TESTAMENT_GROUPS.flatMap((g) => g.books).filter((id) =>
      oldIds.has(id),
    )
    expect(shared).toEqual([])
  })

  it("keys each cluster's introduction by a canonical book", () => {
    expect(
      Object.keys(CLUSTER_INTROS).filter((id) => !ids.includes(id)),
    ).toEqual([])
  })

  // 1 João's own introduction would hide the one for the three letters.
  it("lists a cluster's introduction before its first book, once loaded", () => {
    const catholic = [
      {
        name: "Cartas Católicas",
        introSlug: "catolicas",
        books: ["2pe", "1jn", "2jn"],
      },
    ]
    const loaded = new Set(["catolicas", "joao"])
    expect(
      withIntros(catholic, "novotestamento", (id) => loaded.has(id)),
    ).toEqual([
      {
        name: "Cartas Católicas",
        introSlug: "catolicas",
        books: ["catolicas", "2pe", "joao", "1jn", "2jn"],
      },
    ])
    expect(
      withIntros(catholic, "novotestamento", () => false)[0].books,
    ).toEqual(["2pe", "1jn", "2jn"])
  })

  // The Android app's "Livro seguinte" card, at a book's last chapter.
  describe("the book after another", () => {
    it("follows the edition's order, not the API's", () => {
      expect(nextCanonBook("gen")).toBe("exo")
      // The API lists the deuterocanonical books last.
      expect(nextCanonBook("est")).toBe("1ma")
      expect(nextCanonBook("mal")).toBe("mat")
    })

    it("ends at Apocalipse, and knows no other page", () => {
      expect(nextCanonBook("rev")).toBeUndefined()
      expect(nextCanonBook("about")).toBeUndefined()
    })
  })
})
