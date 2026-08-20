import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { BookSelectorComponent } from "./book-selector.component"

describe("BookSelectorComponent", () => {
  let component: BookSelectorComponent
  let fixture: ComponentFixture<BookSelectorComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookSelectorComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(BookSelectorComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  // The drawer is a closed navigational control, not page content: as headings
  // these duplicated the book index's testament headings on the home page, and
  // before that (as h4s) they were the first headings on every page, ahead of
  // any h1.
  it("should label the testaments without using headings", () => {
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelectorAll("h1, h2, h3, h4, h5, h6").length).toBe(0)
    expect(
      Array.from(element.querySelectorAll(".testament-label")).map((label) =>
        label.textContent?.trim(),
      ),
    ).toEqual(["Antigo Testamento", "Novo Testamento"])
  })

  it("should still announce each testament as a labelled group", () => {
    const groups = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[role="group"]'),
    )

    expect(
      groups.map((group) => {
        const id = group.getAttribute("aria-labelledby")
        return group.querySelector(`#${id}`)?.textContent?.trim()
      }),
    ).toEqual(["Antigo Testamento", "Novo Testamento"])
  })

  // ngAfterViewInit also runs while prerendering, where the server DOM has no
  // scrollIntoView — calling it there threw once per prerendered route.
  it("should not scroll straight from ngAfterViewInit", () => {
    component.selectedBookId = "gen"
    const target = document.createElement("div")
    target.setAttribute("data-book-id", "gen")
    ;(fixture.nativeElement as HTMLElement).appendChild(target)
    const scrollSpy = spyOn(Element.prototype, "scrollIntoView")

    component.ngAfterViewInit()

    expect(scrollSpy).not.toHaveBeenCalled()
  })

  // The other half of the deferral: skipping the scroll on the server must not
  // mean skipping it in the browser. Without this the spec above would pass for
  // an implementation that never scrolls at all.
  it("should still scroll to the selected book once a render happens", async () => {
    // A fixture of its own: the shared one has already rendered, and
    // afterNextRender only fires for the render that follows registration.
    const freshFixture = TestBed.createComponent(BookSelectorComponent)
    const target = document.createElement("div")
    target.setAttribute("data-book-id", "gen")
    ;(freshFixture.nativeElement as HTMLElement).appendChild(target)
    freshFixture.componentInstance.selectedBookId = "gen"
    const scrollSpy = spyOn(Element.prototype, "scrollIntoView")

    freshFixture.detectChanges()
    await freshFixture.whenStable()

    expect(scrollSpy).toHaveBeenCalled()
  })

  it("filters books with accent-insensitive short names", () => {
    component.books = [
      {
        id: "gen",
        name: "Livro do Génesis",
        shortName: "Gênesis",
        abrv: "Gn",
        chapterCount: 50,
      },
    ]

    component.filterBooks("genesis")

    expect(component.otDataSource.data).toEqual([
      {
        name: "Pentateuco",
        books: ["gen"],
      },
    ])
  })
})
