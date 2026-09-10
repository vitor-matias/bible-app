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

  // Lighthouse flagged both images as unsized: without intrinsic dimensions
  // the text jumps when they arrive.
  it("declares intrinsic sizes on its images", () => {
    const element = fixture.nativeElement as HTMLElement
    const images = Array.from(element.querySelectorAll("img"))

    expect(images.length).toBe(2)
    for (const image of images) {
      expect(image.getAttribute("width")).toMatch(/^\d+$/)
      expect(image.getAttribute("height")).toMatch(/^\d+$/)
    }
  })

  it("serves the logos as WebP", () => {
    const element = fixture.nativeElement as HTMLElement
    const sources = Array.from(element.querySelectorAll("img")).map((image) =>
      image.getAttribute("src"),
    )

    expect(sources).toEqual(["imgs/db.webp", "imgs/capuchinhos.webp"])
  })

  // Phones get the 640px candidate; only wide desktop columns need 1200px.
  it("offers a smaller candidate for the wide logo", () => {
    const element = fixture.nativeElement as HTMLElement
    const logo = element.querySelector<HTMLImageElement>(
      'img[src="imgs/capuchinhos.webp"]',
    )

    expect(logo?.getAttribute("srcset")).toBe(
      "imgs/capuchinhos-640.webp 640w, imgs/capuchinhos.webp 1200w",
    )
    expect(logo?.getAttribute("sizes")).toBe("(min-width: 768px) 40vw, 100vw")
  })

  // The first logo is at the top of the page; the second starts below the
  // fold on a phone and should not compete with the text for bandwidth.
  it("lazy-loads only the second image", () => {
    const element = fixture.nativeElement as HTMLElement
    const [first, second] = Array.from(element.querySelectorAll("img"))

    expect(first.loading).not.toBe("lazy")
    expect(second.loading).toBe("lazy")
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
