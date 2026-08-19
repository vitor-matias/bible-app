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

  // The About page is the prerendered home page, and the toolbar picker does
  // not take the h1 there (its label cycles to an "Escolher Livro" prompt), so
  // the page has to carry its own.
  it("carries the page's single h1", () => {
    const headings = (fixture.nativeElement as HTMLElement).querySelectorAll(
      "h1",
    )

    expect(headings.length).toBe(1)
    expect(headings[0].textContent).toContain("Bíblia Sagrada dos Capuchinhos")
  })

  it("does not list the books on the About page", () => {
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelector("nav.book-index")).toBeNull()
    expect(element.querySelector('a[href="/gn/1"]')).toBeNull()
  })
})
