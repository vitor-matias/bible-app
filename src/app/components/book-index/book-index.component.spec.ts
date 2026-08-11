import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { BehaviorSubject } from "rxjs"
import { filter } from "rxjs/operators"
import { BookService } from "../../services/book.service"
import { BookIndexComponent } from "./book-index.component"

describe("BookIndexComponent", () => {
  let fixture: ComponentFixture<BookIndexComponent>
  let booksSubject: BehaviorSubject<Book[]>

  const books: Book[] = [
    {
      id: "gen",
      name: "Génesis",
      shortName: "Génesis",
      abrv: "Gn",
      chapterCount: 50,
    },
    {
      id: "psa",
      name: "Salmos",
      shortName: "Salmos",
      abrv: "Sl",
      chapterCount: 150,
    },
    {
      id: "mat",
      name: "Evangelho segundo São Mateus",
      shortName: "Mateus",
      abrv: "Mt",
      chapterCount: 28,
    },
    {
      id: "about",
      name: "Sobre a Bíblia dos Capuchinhos",
      shortName: "Sobre a Bíblia",
      abrv: "Sobre",
      chapterCount: 1,
    },
  ]

  beforeEach(async () => {
    booksSubject = new BehaviorSubject<Book[]>([])
    const bookServiceStub = {
      books$: booksSubject
        .asObservable()
        .pipe(filter((value) => value.length > 0)),
      getUrlAbrv: (book: Book) => book.abrv.replace(/\s/g, "").toLowerCase(),
    }

    await TestBed.configureTestingModule({
      imports: [BookIndexComponent],
      providers: [
        provideRouter([]),
        { provide: BookService, useValue: bookServiceStub },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(BookIndexComponent)
  })

  function links(): HTMLAnchorElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("a"),
    )
  }

  it("renders nothing until the book list arrives", () => {
    fixture.detectChanges()
    expect(links().length).toBe(0)
  })

  it("links every known book to its first chapter using the full name", () => {
    booksSubject.next(books)
    fixture.detectChanges()

    const anchors = links()
    expect(anchors.map((a) => a.textContent?.trim())).toEqual([
      "Génesis",
      "Salmos",
      "Evangelho segundo São Mateus",
    ])
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "/gn/1",
      "/sl/1",
      "/mt/1",
    ])
  })

  it("does not link the synthetic About page", () => {
    booksSubject.next(books)
    fixture.detectChanges()

    const anchorTexts = links().map((a) => a.textContent ?? "")
    expect(anchorTexts.some((text) => text.includes("Sobre"))).toBeFalse()
  })

  it("groups books under both testaments with a heading hierarchy", () => {
    booksSubject.next(books)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    // h2 (not h1): the page h1 belongs to the reader header.
    expect(element.querySelector("h1")).toBeNull()
    expect(element.querySelector("h2")?.textContent).toContain(
      "Ler a Bíblia online",
    )
    const testamentHeadings = Array.from(element.querySelectorAll("h3")).map(
      (heading) => heading.textContent?.trim(),
    )
    expect(testamentHeadings).toEqual(["Antigo Testamento", "Novo Testamento"])
  })
})
