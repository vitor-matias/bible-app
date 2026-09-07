import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { BookIntroComponent } from "./book-intro.component"

describe("BookIntroComponent", () => {
  let component: BookIntroComponent
  let fixture: ComponentFixture<BookIntroComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookIntroComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(BookIntroComponent)
    component = fixture.componentInstance
  })

  const setIntroduction = (introduction: IntroElement[]) => {
    fixture.componentRef.setInput("introduction", introduction)
    fixture.detectChanges()
  }

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should merge a section with the following paragraph as run-in", () => {
    setIntroduction([
      { type: "introSection", level: 1, text: "AUTOR" },
      { type: "introParagraph", text: "João, o discípulo amado." },
    ])

    const paragraph = fixture.nativeElement.querySelector(".intro-paragraph")
    expect(paragraph.textContent).toContain("AUTOR")
    expect(paragraph.textContent).toContain("João, o discípulo amado.")
    expect(
      paragraph.querySelector(".intro-section-inline")?.textContent,
    ).toContain("AUTOR")
  })

  it("should render a row per entry and a cell per value in a table", () => {
    setIntroduction([
      {
        type: "introTable",
        rows: [
          ["1—11", "Origens"],
          ["12—50", "Patriarcas"],
        ],
      },
    ] as IntroElement[])

    const rows = fixture.nativeElement.querySelectorAll("table.intro-table tr")
    expect(rows.length).toBe(2)
    expect(rows[0].querySelectorAll("td").length).toBe(2)
    expect(rows[0].querySelectorAll("td")[0].textContent).toContain("1—11")
    expect(rows[1].querySelectorAll("td")[1].textContent).toContain(
      "Patriarcas",
    )
  })

  // The sidebar renders <book-intro> again; without the reset its own
  // .intro-container compounds 120% to 144%.
  it("should not compound the container font size inside a sidebar", () => {
    setIntroduction([
      {
        type: "introSidebar",
        content: [{ type: "introParagraph", text: "Nota lateral." }],
      },
    ] as IntroElement[])

    const nested = fixture.nativeElement.querySelector(
      ".intro-sidebar .intro-container",
    )
    expect(nested).toBeTruthy()
    expect(getComputedStyle(nested).fontSize).toBe(
      getComputedStyle(fixture.nativeElement.querySelector(".intro-container"))
        .fontSize,
    )
  })

  it("should render the top-level intro title as h2, leaving h1 to the page", () => {
    setIntroduction([
      { type: "introTitle", level: 1, text: "EVANGELHO SEGUNDO SÃO JOÃO" },
      { type: "introTitle", level: 2, text: "Subtítulo" },
    ])

    expect(fixture.nativeElement.querySelectorAll("h1").length).toBe(0)
    expect(
      fixture.nativeElement.querySelector("h2.intro-title-1").textContent,
    ).toContain("EVANGELHO SEGUNDO SÃO JOÃO")
    expect(fixture.nativeElement.querySelector("h3.intro-title-2")).toBeTruthy()
  })

  it("should group consecutive list items into one list", () => {
    setIntroduction([
      { type: "introListItem", text: "primeiro" },
      { type: "introListItem", text: "segundo" },
      { type: "introParagraph", text: "depois" },
    ])

    const lists = fixture.nativeElement.querySelectorAll("ul.intro-list")
    expect(lists.length).toBe(1)
    expect(lists[0].querySelectorAll("li.intro-list-item").length).toBe(2)
  })

  it("should indent level-2 outline entries", () => {
    setIntroduction([
      { type: "introOutline", level: 1, text: "I. Prólogo" },
      { type: "introOutline", level: 2, text: "1. Primeiro ciclo" },
    ])

    const outlines = fixture.nativeElement.querySelectorAll(".intro-outline")
    expect(outlines.length).toBe(2)
    expect(outlines[1].classList).toContain("intro-outline-2")
  })

  it("should render sidebars recursively through a nested book-intro", () => {
    setIntroduction([
      { type: "introParagraph", text: "fora da barra lateral" },
      {
        type: "introSidebar",
        content: [
          { type: "introMajorSection", text: "PAULO, POR ELE PRÓPRIO" },
          { type: "introParagraph", text: "Sou Israelita." },
        ],
      },
    ])

    const sidebar = fixture.nativeElement.querySelector("aside.intro-sidebar")
    expect(sidebar).toBeTruthy()
    const nested = sidebar.querySelector("book-intro")
    expect(nested).toBeTruthy()
    expect(nested.textContent).toContain("PAULO, POR ELE PRÓPRIO")
    expect(nested.textContent).toContain("Sou Israelita.")
  })
})
