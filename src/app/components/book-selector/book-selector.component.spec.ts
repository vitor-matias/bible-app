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

  // Nothing else on the page lists the testaments, so these are the drawer's
  // only heading structure. h2 because the toolbar h1 comes first in the DOM —
  // the h4s these once were skipped two levels.
  it("should label the testaments with headings that continue the outline", () => {
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelectorAll("h1, h3, h4, h5, h6").length).toBe(0)
    expect(
      Array.from(element.querySelectorAll("h2.testament-label")).map((label) =>
        label.textContent?.trim(),
      ),
    ).toEqual(["Antigo Testamento", "Novo Testamento"])
  })

  // The testament label and the tree nodes once shared a grouped selector with
  // the (unused) h3. Editing one must not drag the other along: styling nodes
  // like labels collapses their fixed 48px box and the book names spill out.
  it("should not style the tree nodes like the testament labels", () => {
    const element = fixture.nativeElement as HTMLElement
    const node = element.querySelector("mat-tree-node") as HTMLElement
    const label = element.querySelector(".testament-label") as HTMLElement
    expect(node).toBeTruthy()

    const nodeStyle = getComputedStyle(node)
    expect(nodeStyle.fontSize).not.toBe(getComputedStyle(label).fontSize)
    // Material pins nodes to 48px; the override lets a wrapped name grow the
    // node rather than overflow it.
    expect(nodeStyle.minHeight).toBe("48px")
    expect(nodeStyle.marginTop).toBe("0px")
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
    expect(groups.some((group) => group.name === "geral")).toBeFalse()
    const pentateuco = groups.find((group) => group.name === "Pentateuco")
    expect(pentateuco?.books).not.toContain("pentateuco")
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

    // Exactly once: ngAfterViewInit and ngOnChanges each schedule a deferred
    // scroll, and scheduling both would scroll twice per open.
    expect(scrollSpy).toHaveBeenCalledTimes(1)
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

  it("keeps the introductions that belong to no group in a filtered list", () => {
    // The whole-Bible and New Testament introductions are childless entries,
    // so a filter that only keeps groups with matching children erases them.
    component.books = [
      {
        id: "geral",
        name: "Introdução Geral",
        shortName: "Introdução Geral",
        abrv: "geral",
        chapterCount: 0,
        introSlug: "geral",
      },
      {
        id: "novotestamento",
        name: "Novo Testamento",
        shortName: "Novo Testamento",
        abrv: "novotestamento",
        chapterCount: 0,
        introSlug: "novotestamento",
      },
    ] as unknown as Book[]

    component.filterBooks("geral")
    expect(component.otDataSource.data).toEqual([{ name: "geral", books: [] }])

    component.filterBooks("novo testamento")
    expect(component.ntDataSource.data).toEqual([
      { name: "novotestamento", books: [] },
    ])
  })

  // With a filter applied, ngOnChanges dropped a new book list on the floor
  // and the tree kept showing results built from the previous one.
  it("re-applies the active filter when the book list changes", () => {
    component.books = [
      {
        id: "gen",
        name: "Livro do Génesis",
        shortName: "Génesis",
        abrv: "Gn",
        chapterCount: 50,
      },
    ] as Book[]
    component.ngOnChanges({
      books: new SimpleChange(undefined, component.books, true),
    })
    component.filterBooks("livro")
    expect(component.otDataSource.data).toEqual([
      { name: "Pentateuco", introSlug: "pentateuco", books: ["gen"] },
    ])

    // Same filter, new list: Exodus matches "livro" too and must appear.
    const previous = component.books
    component.books = [
      ...previous,
      {
        id: "exo",
        name: "Livro do Êxodo",
        shortName: "Êxodo",
        abrv: "Ex",
        chapterCount: 40,
      },
    ] as Book[]
    component.ngOnChanges({
      books: new SimpleChange(previous, component.books, false),
    })

    expect(component.otDataSource.data).toEqual([
      { name: "Pentateuco", introSlug: "pentateuco", books: ["gen", "exo"] },
    ])
  })
})
