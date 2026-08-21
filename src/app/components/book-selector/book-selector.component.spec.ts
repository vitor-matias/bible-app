import { SimpleChange } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import type { CanonGroup } from "../../bible-canon"

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

  // The testament labels sit one level below the page h1 in the toolbar. As h4s
  // they were the first headings on every page, ahead of any h1.
  it("should label the testaments with h2 headings", () => {
    const headings = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("h2"),
    ).map((heading) => heading.textContent?.trim())

    expect(headings).toEqual(["Antigo Testamento", "Novo Testamento"])
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

  it("lists a group's introduction before its books", () => {
    component.books = [
      {
        id: "pentateuco",
        name: "Introdução Ao Pentateuco",
        shortName: "Introdução Ao Pentateuco",
        abrv: "pentateuco",
        chapterCount: 0,
        introduction: [],
        introSlug: "pentateuco",
      },
      {
        id: "gen",
        name: "Livro do Génesis",
        shortName: "Génesis",
        abrv: "Gn",
        chapterCount: 50,
      },
    ]
    component.ngOnChanges({
      books: new SimpleChange(undefined, component.books, true),
    })

    const groups = component.otDataSource.data as CanonGroup[]
    const pentateuco = groups.find((group) => group.name === "Pentateuco")
    expect(pentateuco?.books[0]).toBe("pentateuco")
  })

  it("omits introduction entries the API did not provide", () => {
    component.books = [
      {
        id: "gen",
        name: "Livro do Génesis",
        shortName: "Génesis",
        abrv: "Gn",
        chapterCount: 50,
      },
    ]
    component.ngOnChanges({
      books: new SimpleChange(undefined, component.books, true),
    })

    // No synthetic intro books loaded: nothing blank may be listed.
    const groups = component.otDataSource.data as CanonGroup[]
    expect(groups.some((group) => group.name === "Introduções")).toBeFalse()
    const pentateuco = groups.find((group) => group.name === "Pentateuco")
    expect(pentateuco?.books).not.toContain("pentateuco")
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
        introSlug: "pentateuco",
        books: ["gen"],
      },
    ])
  })
})
