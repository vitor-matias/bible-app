import { Component, SimpleChange, ViewChild } from "@angular/core"
import {
  type ComponentFixture,
  fakeAsync,
  flush,
  TestBed,
} from "@angular/core/testing"
import { MATERIAL_ANIMATIONS } from "@angular/material/core"
import { MatDrawer, MatSidenavModule } from "@angular/material/sidenav"
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

  it("names a cluster's introduction, listed before its books", () => {
    component.books = [
      {
        id: "joao",
        name: "Cartas de João",
        shortName: "Cartas de João",
        abrv: "joao",
        chapterCount: 0,
        introduction: [],
        introSlug: "joao",
      },
      {
        id: "1jn",
        name: "Primeira Carta de São João",
        shortName: "1 João",
        abrv: "1 Jo",
        chapterCount: 5,
      },
    ]
    component.ngOnChanges({
      books: new SimpleChange(undefined, component.books, true),
    })

    const groups = component.ntDataSource.data as CanonGroup[]
    const catholic = groups.find((group) => group.name === "Cartas Católicas")
    expect(catholic?.books).toEqual([
      "jas",
      "1pe",
      "2pe",
      "joao",
      "1jn",
      "2jn",
      "3jn",
      "jud",
    ])
    expect(component.entryLabel("joao")).toBe("Cartas de João")
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

  // `font-size: large` is an absolute keyword: lowering the font size shrank
  // the group labels but not the book names beside them.
  it("scales the book buttons with the inherited font size", () => {
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
    component.otTreeControl.expandAll()
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const button = host.querySelector(".bookSelectorButton") as HTMLElement
    expect(button).toBeTruthy()

    host.style.fontSize = "10px"
    const small = Number.parseFloat(getComputedStyle(button).fontSize)
    host.style.fontSize = "20px"
    const large = Number.parseFloat(getComputedStyle(button).fontSize)

    expect(large).toBeCloseTo(small * 2, 1)
  })

  // The drawer sits inside the reader, which already ends above the
  // navigation bar: padding the list for the inset again left a large blank
  // space below the last row.
  it("does not pad the book list for the bottom system inset", () => {
    const host = fixture.nativeElement as HTMLElement
    const list = host.querySelector(".bible-books-container") as HTMLElement

    host.style.setProperty("--app-inset-bottom", "100px")
    expect(getComputedStyle(list).paddingBottom).toBe("8px")
  })
})

@Component({
  imports: [MatSidenavModule, BookSelectorComponent],
  template: `
    <mat-drawer-container>
      <mat-drawer mode="over">
        <book-selector [books]="books" selectedBookId="mal"></book-selector>
      </mat-drawer>
    </mat-drawer-container>
  `,
})
class DrawerHostComponent {
  books: Book[] = [
    {
      id: "mal",
      name: "Livro do Profeta Malaquias",
      shortName: "Malaquias",
      abrv: "Ml",
      chapterCount: 3,
    },
  ]
  @ViewChild(MatDrawer) drawer!: MatDrawer
}

describe("BookSelectorComponent in the reader's drawer", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DrawerHostComponent],
      providers: [
        {
          provide: MATERIAL_ANIMATIONS,
          useValue: { animationsDisabled: true },
        },
      ],
    })
  })

  // The reader builds the list with the page, inside the closed drawer, whose
  // content is display: none. The only scroll ran then and moved nothing, so
  // the drawer opened at Génesis whatever the book.
  it("scrolls to the selected book when the drawer opens", fakeAsync(() => {
    const fixture = TestBed.createComponent(DrawerHostComponent)
    const scrollSpy = spyOn(Element.prototype, "scrollIntoView")
    fixture.detectChanges()
    flush()
    expect(scrollSpy).not.toHaveBeenCalled()

    fixture.componentInstance.drawer.open()
    flush()

    const malaquias = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-book-id="mal"]',
    ) as HTMLElement
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy.calls.mostRecent().object).toBe(malaquias)
  }))
})
