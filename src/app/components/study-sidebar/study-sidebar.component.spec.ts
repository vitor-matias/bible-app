import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { StudySidebarComponent } from "./study-sidebar.component"

function makeBook(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    name: id.toUpperCase(),
    shortName: id.toUpperCase(),
    abrv: id,
    chapterCount: 10,
    ...overrides,
  }
}

/** Matthew, Mark and Genesis: two canon groups, in two testaments. */
const BOOKS: Book[] = [
  makeBook("gen", { shortName: "Génesis", chapterCount: 50 }),
  makeBook("mat", { shortName: "Mateus", chapterCount: 28 }),
  makeBook("mrk", { shortName: "Marcos", chapterCount: 16 }),
]

/** The synthetic books a standalone introduction is served as. */
function makeIntro(slug: string, name: string): Book {
  return makeBook(slug, {
    name,
    shortName: name,
    chapterCount: 0,
    introSlug: slug,
  })
}

const BOOKS_WITH_INTROS: Book[] = [
  ...BOOKS,
  makeIntro("pentateuco", "Pentateuco"),
  makeIntro("geral", "Introdução Geral"),
]

describe("StudySidebarComponent", () => {
  let component: StudySidebarComponent
  let fixture: ComponentFixture<StudySidebarComponent>

  function setInputs(next: {
    books?: Book[]
    book?: Book
    chapters?: Chapter[]
    selectedChapter?: number
  }): void {
    // setInput, not a hand-written ngOnChanges: it runs the same input
    // pipeline Angular does and marks this OnPush view dirty, so assertions
    // made after a second call read fresh markup rather than stale.
    for (const [key, value] of Object.entries(next)) {
      fixture.componentRef.setInput(key, value)
    }
    fixture.detectChanges()
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudySidebarComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(StudySidebarComponent)
    component = fixture.componentInstance
  })

  it("lists only the canon groups this edition actually serves", () => {
    setInputs({ books: BOOKS })

    const names = component.groups.map((group) => group.name)
    expect(names).toContain("Pentateuco")
    expect(names).toContain("Evangelhos e Atos")
    // Nothing from the books the stub list leaves out.
    expect(names).not.toContain("Apocalipse")
  })

  it("opens the group holding the book being read", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })

    expect(component.expandedGroup).toBe("Evangelhos e Atos")
  })

  it("follows the reader into another group", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })
    setInputs({ book: BOOKS[0] })

    expect(component.expandedGroup).toBe("Pentateuco")
  })

  it("leaves a group the reader collapsed by hand collapsed", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })
    const group = component.groups.find((g) => g.name === "Evangelhos e Atos")
    if (!group) throw new Error("expected the gospels group")

    component.toggleGroup(group)

    expect(component.isExpanded(group)).toBeFalse()
  })

  it("renders a group opening without waiting for another pass", () => {
    setInputs({ books: BOOKS, book: BOOKS[0] })

    // No detectChanges() after the click, as above.
    const gospels = Array.from(
      fixture.nativeElement.querySelectorAll(".group-toggle"),
    ).find((button) =>
      (button as HTMLElement).textContent?.includes("Evangelhos"),
    ) as HTMLElement
    gospels.dispatchEvent(new MouseEvent("click"))

    expect(
      fixture.nativeElement.querySelectorAll(".book-row").length,
    ).toBeGreaterThan(0)
  })

  describe("introductions", () => {
    it("leads a group with the introduction written for it", () => {
      setInputs({ books: BOOKS_WITH_INTROS, book: BOOKS[0] })

      const pentateuch = component.groups.find((g) => g.name === "Pentateuco")
      expect(pentateuch?.books[0].id).toBe("pentateuco")
    })

    it("names it for its heading rather than repeating the group", () => {
      setInputs({ books: BOOKS_WITH_INTROS, book: BOOKS[0] })
      fixture.detectChanges()

      // Scoped to the groups: the standalone introductions above them keep
      // their own names, which is the point of the distinction.
      const rows = Array.from(
        fixture.nativeElement.querySelectorAll(".group .book-name"),
      ).map((row) => (row as HTMLElement).textContent?.trim())
      expect(rows[0]).toBe("Introdução")
      expect(rows).toContain("Génesis")
    })

    it("shows no chapter count for something with no chapters", () => {
      setInputs({ books: BOOKS_WITH_INTROS, book: BOOKS[0] })
      fixture.detectChanges()

      const first = fixture.nativeElement.querySelector(".group .book-row")
      expect(first.querySelector(".book-count").textContent.trim()).toBe("")
    })

    it("leaves a shared introduction to the books that already reach it", () => {
      // Samuel's introduction covers 1 and 2 Samuel, and shows as "Intro" in
      // each of their chapter lists; listing it again would say it twice.
      const withShared = [
        ...BOOKS_WITH_INTROS,
        makeIntro("samuel", "Livros de Samuel"),
        makeBook("1sa", { shortName: "1 Samuel", sharedIntroSlug: "samuel" }),
      ]
      setInputs({ books: withShared, book: BOOKS[0] })

      const standalone = component.sections
        .filter((section) => section.kind === "intro")
        .map((section) => (section.kind === "intro" ? section.book.id : ""))
      expect(standalone).toEqual(["geral"])
    })

    it("leads the canon with the introduction to the whole Bible", () => {
      setInputs({ books: BOOKS_WITH_INTROS, book: BOOKS[0] })

      // First in the rail, ahead of the Old Testament it introduces — where
      // the drawer's picker puts it too.
      const first = component.sections[0]
      expect(first.kind).toBe("intro")
      expect(first.kind === "intro" && first.book.id).toBe("geral")
    })

    it("leads the New Testament with its own introduction", () => {
      const withNt = [
        ...BOOKS_WITH_INTROS,
        makeIntro("novotestamento", "Novo Testamento"),
      ]
      setInputs({ books: withNt, book: BOOKS[0] })

      const order = component.sections.map((section) =>
        section.kind === "intro" ? section.book.id : section.group.name,
      )
      const nt = order.indexOf("novotestamento")
      // After an Old Testament group, and immediately before the gospels.
      expect(order.indexOf("Pentateuco")).toBeLessThan(nt)
      expect(order[nt + 1]).toBe("Evangelhos e Atos")
    })

    it("opens an introduction when it is picked", () => {
      setInputs({ books: BOOKS_WITH_INTROS, book: BOOKS[0] })
      fixture.detectChanges()
      const picked: string[] = []
      component.selectBook.subscribe((event) => picked.push(event.bookId))

      fixture.nativeElement
        .querySelector(".standalone-intro .book-row")
        .dispatchEvent(new MouseEvent("click"))

      expect(picked).toEqual(["geral"])
    })

    it("finds an introduction through the filter", () => {
      setInputs({ books: BOOKS_WITH_INTROS, book: BOOKS[0] })

      component.onFilter("geral")

      expect(component.matches.map((entry) => entry.id)).toEqual(["geral"])
    })
  })

  describe("filtering", () => {
    it("flattens the canon to the books that match", () => {
      setInputs({ books: BOOKS, book: BOOKS[1] })

      component.onFilter("mar")
      fixture.detectChanges()

      // The group headings step aside: a reader typing a name wants the book.
      expect(fixture.nativeElement.querySelector(".group-toggle")).toBeNull()
      const rows = Array.from(
        fixture.nativeElement.querySelectorAll(".book-row"),
      ).map((row) =>
        (row as HTMLElement).querySelector(".book-name")?.textContent?.trim(),
      )
      expect(rows).toEqual(["Marcos"])
    })

    it("ignores accents and case", () => {
      setInputs({ books: BOOKS, book: BOOKS[1] })

      component.onFilter("GENESIS")

      expect(component.matches.map((book) => book.id)).toEqual(["gen"])
    })

    it("matches the long name as well as the short one", () => {
      setInputs({ books: BOOKS, book: BOOKS[1] })

      component.onFilter("mrk")

      expect(component.matches.map((book) => book.id)).toEqual(["mrk"])
    })

    it("says so when nothing matches", () => {
      setInputs({ books: BOOKS, book: BOOKS[1] })

      component.onFilter("zzz")
      fixture.detectChanges()

      expect(component.matches).toEqual([])
      expect(
        fixture.nativeElement.querySelector(".filter-empty").textContent,
      ).toContain("Nenhum livro")
    })

    it("gives the groups back when the filter is cleared", () => {
      setInputs({ books: BOOKS, book: BOOKS[1] })
      component.onFilter("mar")

      component.clearFilter()
      fixture.detectChanges()

      expect(component.filtering).toBeFalse()
      expect(fixture.nativeElement.querySelector(".group-toggle")).toBeTruthy()
    })

    it("re-runs itself against a new book list", () => {
      setInputs({ books: BOOKS, book: BOOKS[1] })
      component.onFilter("mar")
      expect(component.matches.length).toBe(1)

      // An introduction loading pushes a new list; the filter must be applied
      // to it rather than leaving stale matches on screen.
      setInputs({ books: [...BOOKS] })

      expect(component.matches.map((book) => book.id)).toEqual(["mrk"])
    })

    it("opens the book a reader picks from the matches", () => {
      setInputs({ books: BOOKS, book: BOOKS[0] })
      component.onFilter("mar")
      fixture.detectChanges()
      const picked: string[] = []
      component.selectBook.subscribe((event) => picked.push(event.bookId))

      fixture.nativeElement
        .querySelector(".book-row")
        .dispatchEvent(new MouseEvent("click"))

      expect(picked).toEqual(["mrk"])
    })
  })

  it("keeps a collapsed group collapsed when only the book list changes", () => {
    // An introduction loading pushes a new book list; the reader has not
    // moved, so nothing should reopen.
    setInputs({ books: BOOKS, book: BOOKS[1] })
    const group = component.groups.find((g) => g.name === "Evangelhos e Atos")
    if (!group) throw new Error("expected the gospels group")
    component.toggleGroup(group)

    setInputs({ books: [...BOOKS] })

    expect(component.isExpanded(group)).toBeFalse()
  })

  it("renders each book of the open group with its chapter count", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })

    const rows = Array.from(
      fixture.nativeElement.querySelectorAll(".book-row"),
    ) as HTMLElement[]
    const labels = rows.map((row) => [
      row.querySelector(".book-name")?.textContent?.trim(),
      row.querySelector(".book-count")?.textContent?.trim(),
    ])
    expect(labels).toEqual([
      ["Mateus", "28"],
      ["Marcos", "16"],
    ])
  })

  it("marks the book being read as the current page", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })

    const current = fixture.nativeElement.querySelector(".book-row.current")
    expect(current.textContent).toContain("Mateus")
    expect(current.getAttribute("aria-current")).toBe("page")
  })

  it("emits the book a reader picks", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })
    const picked: string[] = []
    component.selectBook.subscribe((event) => picked.push(event.bookId))

    fixture.nativeElement
      .querySelectorAll(".book-row")[1]
      .dispatchEvent(new MouseEvent("click"))

    expect(picked).toEqual(["mrk"])
  })

  it("renders a cell per chapter and marks the current one", () => {
    const chapters: Chapter[] = [
      { bookId: "mat", number: 1 },
      { bookId: "mat", number: 2 },
      { bookId: "mat", number: 3 },
    ]
    setInputs({ books: BOOKS, book: BOOKS[1], chapters, selectedChapter: 2 })

    const cells = fixture.nativeElement.querySelectorAll(".chapter-cell")
    expect(cells.length).toBe(3)
    expect(
      fixture.nativeElement
        .querySelector(".chapter-cell.current")
        .textContent.trim(),
    ).toBe("2")
  })

  it("names the introduction instead of numbering it", () => {
    const chapters: Chapter[] = [
      { bookId: "mat", number: 0, title: "Introdução" },
      { bookId: "mat", number: 1 },
    ]
    setInputs({ books: BOOKS, book: BOOKS[1], chapters, selectedChapter: 1 })

    const intro = fixture.nativeElement.querySelector(".chapter-cell.intro")
    expect(intro.textContent.trim()).toBe("Intro")
    expect(intro.getAttribute("aria-label")).toBe("Introdução")
  })

  it("emits the chapter a reader picks", () => {
    const chapters: Chapter[] = [
      { bookId: "mat", number: 1 },
      { bookId: "mat", number: 2 },
    ]
    setInputs({ books: BOOKS, book: BOOKS[1], chapters, selectedChapter: 1 })
    const picked: number[] = []
    component.selectChapter.subscribe((event) =>
      picked.push(event.chapterNumber),
    )

    fixture.nativeElement
      .querySelectorAll(".chapter-cell")[1]
      .dispatchEvent(new MouseEvent("click"))

    expect(picked).toEqual([2])
  })

  it("keeps only the unfold button when it is folded away", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })
    fixture.componentRef.setInput("collapsed", true)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector(".book-row")).toBeNull()
    const toggle = fixture.nativeElement.querySelector(".collapse-toggle")
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(toggle.getAttribute("aria-label")).toBe("Mostrar livros e capítulos")
  })

  it("asks to be folded when the button is pressed", () => {
    setInputs({ books: BOOKS, book: BOOKS[1] })
    let asked = 0
    component.toggleCollapsed.subscribe(() => asked++)

    fixture.nativeElement
      .querySelector(".collapse-toggle")
      .dispatchEvent(new MouseEvent("click"))

    expect(asked).toBe(1)
  })

  it("hides the chapter section for a book with no chapters to pick", () => {
    setInputs({ books: BOOKS, book: BOOKS[1], chapters: [] })

    expect(fixture.nativeElement.querySelector(".chapters")).toBeNull()
  })
})
