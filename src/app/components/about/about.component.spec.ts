import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { of } from "rxjs"

import { BookService } from "../../services/book.service"
import { AboutComponent } from "./about.component"

describe("AboutComponent", () => {
  let component: AboutComponent
  let fixture: ComponentFixture<AboutComponent>

  beforeEach(async () => {
    const bookServiceStub = {
      books$: of<Book[]>([
        {
          id: "gen",
          name: "Génesis",
          shortName: "Génesis",
          abrv: "Gn",
          chapterCount: 50,
        },
      ]),
      getUrlAbrv: (book: Book) => book.abrv.replace(/\s/g, "").toLowerCase(),
    }

    await TestBed.configureTestingModule({
      imports: [AboutComponent],
      providers: [
        provideRouter([]),
        { provide: BookService, useValue: bookServiceStub },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(AboutComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  // The page is prose only: the toolbar title supplies the heading, and the
  // book list was deliberately removed from here.
  it("adds no heading of its own", () => {
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelectorAll("h1, h2, h3, h4, h5, h6").length).toBe(0)
  })

  it("does not list the books on the About page", () => {
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelector("nav.book-index")).toBeNull()
    expect(element.querySelector('a[href="/gn/1"]')).toBeNull()
  })

  // Prose lives in real paragraphs, not text nodes separated by empty <p>s.
  it("puts each organisation's prose in non-empty paragraphs", () => {
    const element = fixture.nativeElement as HTMLElement
    const orgs = element.querySelectorAll<HTMLElement>("section.org")

    expect(orgs.length).toBe(2)
    for (const org of Array.from(orgs)) {
      const paragraphs = Array.from(org.querySelectorAll("p"))
      expect(paragraphs.length).toBeGreaterThan(0)
      for (const p of paragraphs) {
        expect(p.textContent?.trim()).not.toBe("")
      }
    }
  })

  it("opens the organisations' sites in a new tab without an opener", () => {
    const element = fixture.nativeElement as HTMLElement
    const links = Array.from(
      element.querySelectorAll<HTMLAnchorElement>("a.site-link"),
    )

    expect(links.map((a) => a.href)).toEqual([
      "https://www.difusorabiblica.com/",
      "https://www.capuchinhos.org/",
    ])
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "difusorabiblica.com",
      "capuchinhos.org",
    ])
    for (const link of links) {
      expect(link.target).toBe("_blank")
      expect(link.relList.contains("noopener")).toBeTrue()
    }
  })

  // The list is not here, but the link to it is: /livros only passes weight to
  // the books if something links to /livros in the first place.
  it("links to the book index", () => {
    const element = fixture.nativeElement as HTMLElement
    const link = element.querySelector<HTMLAnchorElement>('a[href="/livros"]')

    expect(link).not.toBeNull()
    expect(link?.textContent?.trim()).toBe(
      "Ler a Bíblia online: todos os livros",
    )
  })
})
