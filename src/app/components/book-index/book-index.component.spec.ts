import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { of } from "rxjs"

import { OLD_TESTAMENT_GROUPS } from "../../bible-canon"
import { BookService } from "../../services/book.service"
import { SeoService } from "../../services/seo.service"
import { BookIndexComponent } from "./book-index.component"

describe("BookIndexComponent", () => {
  let fixture: ComponentFixture<BookIndexComponent>
  let element: HTMLElement
  let seoSpy: jasmine.SpyObj<SeoService>

  function book(id: string, name: string, abrv: string): Book {
    return { id, name, shortName: name, abrv, chapterCount: 1 } as Book
  }

  /**
   * A slice of the canon wide enough to cover every branch: groups with and
   * without a standalone introduction, a canonical id the API did not return,
   * and the synthetic entries BookService appends to books$.
   */
  const books: Book[] = [
    book("gen", "Génesis", "Gn"),
    book("exo", "Êxodo", "Ex"),
    // "lev", "num" and "deu" are deliberately absent from this stub.
    book("jos", "Josué", "Js"),
    book("mat", "Evangelho segundo São Mateus", "Mt"),
    book("heb", "Carta aos Hebreus", "Heb"),
    book("rev", "Apocalipse", "Ap"),
    // Synthetic entries: the About page, and one standalone introduction.
    book("about", "Sobre a Bíblia dos Capuchinhos", "Sobre"),
    book("pentateuco", "Introdução ao Pentateuco", "pentateuco"),
  ]

  async function setup(available: Book[] = books): Promise<void> {
    seoSpy = jasmine.createSpyObj<SeoService>("SeoService", [
      "updateForBookIndex",
    ])
    const bookServiceStub = {
      books$: of(available),
      getUrlAbrv: (entry: Book) => entry.abrv.replace(/\s/g, "").toLowerCase(),
    }

    await TestBed.configureTestingModule({
      imports: [BookIndexComponent],
      providers: [
        provideRouter([]),
        { provide: BookService, useValue: bookServiceStub },
        { provide: SeoService, useValue: seoSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(BookIndexComponent)
    fixture.detectChanges()
    element = fixture.nativeElement as HTMLElement
  }

  function hrefs(): string[] {
    return Array.from(element.querySelectorAll("a")).map(
      (anchor) => anchor.getAttribute("href") ?? "",
    )
  }

  beforeEach(async () => {
    await setup()
  })

  it("should create", () => {
    expect(fixture.componentInstance).toBeTruthy()
  })

  // The whole point of the page: a crawlable anchor to every book the API
  // returned, so link weight reaches all of them in one hop.
  it("links every canonical book to its first chapter", () => {
    expect(hrefs()).toContain("/gn/1")
    expect(hrefs()).toContain("/ex/1")
    expect(hrefs()).toContain("/js/1")
    expect(hrefs()).toContain("/mt/1")
    expect(hrefs()).toContain("/heb/1")
    expect(hrefs()).toContain("/ap/1")
  })

  it("groups the books by testament and by canon group", () => {
    const testaments = Array.from(element.querySelectorAll("h2")).map(
      (heading) => heading.textContent?.trim(),
    )
    expect(testaments).toEqual(["Antigo Testamento", "Novo Testamento"])

    const groups = Array.from(element.querySelectorAll("h3")).map((heading) =>
      heading.textContent?.trim(),
    )
    expect(groups).toContain("Pentateuco")
    expect(groups).toContain("Apocalipse")
  })

  it("gives the page a single h1 naming it", () => {
    const headings = element.querySelectorAll("h1")
    expect(headings.length).toBe(1)
    expect(headings[0].textContent?.trim()).toBe("Livros da Bíblia")
  })

  // Standalone introductions are prerendered pages too, so the hub links them.
  it("links a group heading to its standalone introduction", () => {
    expect(hrefs()).toContain("/pentateuco/intro")
  })

  // Every OT group in the canon declares an introSlug, but only "pentateuco"
  // is in this stub — the rest must not become links to pages that were never
  // prerendered.
  it("leaves a group unlinked when its introduction is not available", () => {
    const withSlug = OLD_TESTAMENT_GROUPS.filter((group) => group.introSlug)
    expect(withSlug.length).toBeGreaterThan(1)

    const introHrefs = hrefs().filter((href) => href.endsWith("/intro"))
    expect(introHrefs).toEqual(["/pentateuco/intro"])

    const historicos = Array.from(element.querySelectorAll("h3")).find(
      (heading) => heading.textContent?.trim() === "Livros Históricos",
    )
    expect(historicos?.querySelector("a")).toBeNull()
  })

  // bible-canon.ts states the 73 canonical books; the About entry and the
  // introduction entries are appended to books$ by BookService and are not
  // books of the Bible.
  it("omits the synthetic About entry", () => {
    expect(hrefs()).not.toContain("/sobre/1")
    expect(element.textContent).not.toContain("Sobre a Bíblia dos Capuchinhos")
  })

  it("skips canonical ids the API did not return", () => {
    expect(hrefs()).not.toContain("/lv/1")
    const pentateuco = Array.from(element.querySelectorAll("h3")).find(
      (heading) => heading.textContent?.trim() === "Pentateuco",
    )
    expect(pentateuco?.parentElement?.querySelectorAll("li").length).toBe(2)
  })

  it("sets the book-index head on init", () => {
    expect(seoSpy.updateForBookIndex).toHaveBeenCalled()
  })

  it("offers a way back to the home page", () => {
    expect(hrefs()).toContain("/")
  })
})
