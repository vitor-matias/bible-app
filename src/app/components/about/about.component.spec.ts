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

  // The About page doubles as the prerendered home page, so it must carry
  // the crawlable book index links.
  it("renders the book index with links into the Bible", () => {
    const nav = (fixture.nativeElement as HTMLElement).querySelector(
      "nav.book-index",
    )
    expect(nav).toBeTruthy()
    expect(nav?.querySelector('a[href="/gn/1"]')?.textContent).toContain(
      "Génesis",
    )
  })
})
