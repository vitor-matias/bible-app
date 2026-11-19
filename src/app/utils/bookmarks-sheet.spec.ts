import titles from "../pastoral-index-titles.json"
import type { BookmarksSheetState } from "../services/native-chrome.types"
import { bookmarksHint, canMark, sheetPassageLabel } from "./bookmarks-sheet"

const ribbons = (label: string | null, current = false) => [
  { color: "red", name: "Vermelho", label, current },
  { color: "blue", name: "Azul", label: null, current: false },
]

const state = (over: Partial<BookmarksSheetState>): BookmarksSheetState => ({
  currentLabel: "Mateus 5",
  canMark: true,
  ribbons: ribbons(null),
  move: null,
  ...over,
})

describe("bookmarksHint", () => {
  it("tells a reader with no ribbon on how to begin, and how to come back", () => {
    expect(bookmarksHint(state({}))).toBe(
      "Escolha uma cor para marcar Mateus 5. Para voltar, abra Marcadores e toque nessa fita.",
    )
  })

  it("adds that a named ribbon goes back, once one is on", () => {
    expect(bookmarksHint(state({ ribbons: ribbons("Mt 7") }))).toBe(
      "Toque numa fita com nome para voltar a essa passagem, ou numa fita livre para marcar Mateus 5.",
    )
  })

  it("says the chapter is marked, and how to change the colour", () => {
    expect(bookmarksHint(state({ ribbons: ribbons("Mt 5", true) }))).toBe(
      "Mateus 5 está marcado. Toque noutra fita livre para mudar a cor.",
    )
  })

  it("says a page can't be marked, and that named ribbons still open", () => {
    expect(bookmarksHint(state({ canMark: false }))).toBe(
      "Esta página não se pode marcar.",
    )
    expect(
      bookmarksHint(state({ canMark: false, ribbons: ribbons("Mt 7") })),
    ).toBe(
      "Esta página não se pode marcar. Toque numa fita com nome para abrir essa passagem.",
    )
  })
})

describe("sheetPassageLabel", () => {
  const books: Record<string, Book> = {
    mat: { id: "mat", shortName: "Mateus" } as Book,
    psa: { id: "psa", shortName: "Salmos" } as Book,
    about: { id: "about", shortName: "Sobre a Bíblia" } as Book,
  }
  const find = (id: string): Book | undefined => books[id]

  it("names a chapter as the passage button does", () => {
    expect(sheetPassageLabel(find, "mat", 11)).toBe("Mateus 11")
    expect(sheetPassageLabel(find, "psa", 96)).toBe("Salmo 96 (95)")
  })

  it("names a book's introduction, and the About page without a chapter", () => {
    expect(sheetPassageLabel(find, "mat", 0)).toBe("Mateus Introdução")
    expect(sheetPassageLabel(find, "about", 1)).toBe("Sobre a Bíblia")
  })

  // The index page opens the same sheet, for a ribbon that marks a theme.
  it("names a theme of the pastoral index by its title, and the index itself", () => {
    const [slug, title] = Object.entries(titles as Record<string, string>)[0]

    expect(sheetPassageLabel(find, `indice/${slug}`, 1)).toBe(title)
    expect(sheetPassageLabel(find, "indice", 1)).toBe("Índice")
  })

  it("falls back to the id for a book it doesn't know", () => {
    expect(sheetPassageLabel(find, "xyz", 3)).toBe("xyz 3")
  })
})

describe("canMark", () => {
  it("refuses only the About page", () => {
    expect(canMark("about")).toBe(false)
    expect(canMark("mat")).toBe(true)
  })
})
