import { buildPassagePicker, type PickerBook } from "./passage-picker"

function book(id: string, extra: Partial<Book> = {}): Book {
  return {
    id,
    name: `Livro ${id}`,
    shortName: id.toUpperCase(),
    abrv: id,
    chapterCount: 2,
    ...extra,
  }
}

describe("buildPassagePicker", () => {
  const books: Book[] = [
    book("geral", { introSlug: "geral", name: "Introdução geral" }),
    book("pentateuco", { introSlug: "pentateuco" }),
    book("gen", {
      introduction: [{ type: "introParagraph", text: "…" } as IntroElement],
      chapters: [
        { bookId: "gen", number: 1, title: "Criação do mundo" },
        { bookId: "gen", number: 2, title: "O homem" },
      ],
    }),
    book("exo"),
    book("psa", {
      shortName: "Salmos",
      name: "Livro dos Salmos",
      chapterCount: 150,
    }),
    book("1sa", { sharedIntroSlug: "samuel" }),
    book("mat"),
    book("tit", { abrv: "Tt \ufeff" }),
    book("about", { name: "Sobre a Bíblia" }),
  ]

  const picker = buildPassagePicker(
    books,
    [
      { bookId: "gen", chapter: 2, color: "blue", timestamp: 1 },
      { bookId: "mat", chapter: 1, color: "red", timestamp: 2 },
    ],
    { bookId: "gen", chapter: 2 },
  )

  const findBook = (id: string): PickerBook | undefined =>
    picker.sections
      .flatMap((section) => section.groups)
      .flatMap((group) => group.books)
      .find((entry) => entry.id === id)

  it("marks where the reader is", () => {
    expect(picker.currentBookId).toBe("gen")
    expect(picker.currentChapter).toBe(2)
  })

  it("groups the books by testament, as the web book selector does", () => {
    const [oldTestament, newTestament] = picker.sections
    expect(oldTestament.title).toBe("Antigo Testamento")
    expect(newTestament.title).toBe("Novo Testamento")

    // The general introduction is listed on its own, before the groups.
    expect(oldTestament.groups[0]).toEqual({
      books: [jasmine.objectContaining({ id: "geral", label: "Introdução" })],
    })
    // A group's introduction comes first in it; unloaded books are left out.
    const pentateuch = oldTestament.groups[1]
    expect(pentateuch.title).toBe("Pentateuco")
    expect(pentateuch.books.map((entry) => entry.id)).toEqual([
      "pentateuco",
      "gen",
      "exo",
    ])
    expect(newTestament.groups.map((group) => group.title)).toEqual([
      "Evangelhos e Atos",
      "Cartas de São Paulo",
      "Sobre a Bíblia",
    ])
  })

  it("lists chapters with their titles, the introduction first", () => {
    expect(findBook("gen")?.chapters).toEqual([
      { number: 0, label: "", title: "Introdução", bookmark: undefined },
      {
        number: 1,
        label: "1",
        title: "Criação do mundo",
        bookmark: undefined,
      },
      { number: 2, label: "2", title: "O homem", bookmark: "blue" },
    ])
  })

  // Leaflets at Mass number most psalms one lower; the edition prints both.
  it("gives each psalm its liturgical number, and VoiceOver its name", () => {
    const psalms = findBook("psa")?.chapters ?? []
    expect(psalms[22]).toEqual({
      number: 23,
      label: "23",
      detail: "22",
      spoken: "Salmo 23, na liturgia 22",
      bookmark: undefined,
    })
    expect(psalms[0]).toEqual({
      number: 1,
      label: "1",
      spoken: "Salmo 1",
      bookmark: undefined,
    })
    expect(findBook("exo")?.chapters[0]).not.toEqual(
      jasmine.objectContaining({ spoken: jasmine.anything() }),
    )
  })

  it("numbers the chapters of books whose titles have not loaded", () => {
    expect(findBook("exo")?.chapters.map((chapter) => chapter.label)).toEqual([
      "1",
      "2",
    ])
    expect(findBook("mat")?.chapters[0].bookmark).toBe("red")
  })

  // Samuel's introduction is shared with 2 Samuel, so it is chapter 0 too.
  it("offers a shared introduction as the book's chapter 0", () => {
    expect(findBook("1sa")?.chapters[0]).toEqual(
      jasmine.objectContaining({ number: 0, title: "Introdução" }),
    )
  })

  it("opens single pages directly: introductions and the About page", () => {
    expect(findBook("pentateuco")?.chapters).toEqual([])
    expect(findBook("about")?.chapters).toEqual([])
  })

  it("labels books by their short names, with their abbreviations", () => {
    expect(findBook("exo")).toEqual(
      jasmine.objectContaining({
        label: "EXO",
        name: "Livro exo",
        abbreviation: "exo",
      }),
    )
  })

  // The compact mode shows these in small tiles.
  it("abbreviates introductions and the About page too", () => {
    expect(findBook("pentateuco")?.abbreviation).toBe("Intro")
    expect(findBook("about")?.abbreviation).toBe("Sobre")
  })

  it("cleans the stray spaces and byte-order marks from abbreviations", () => {
    expect(findBook("tit")?.abbreviation).toBe("Tt")
  })
})
