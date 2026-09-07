import { NEW_TESTAMENT_GROUPS, OLD_TESTAMENT_GROUPS } from "./bible-canon"

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
})
