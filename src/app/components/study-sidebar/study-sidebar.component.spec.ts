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
