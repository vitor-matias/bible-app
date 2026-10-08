import { type ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { PreferencesService } from "../../services/preferences.service"
import type { PassagePickerData, PickerBook } from "../../utils/passage-picker"
import { PassagePickerSheetComponent } from "./passage-picker-sheet.component"

describe("PassagePickerSheetComponent", () => {
  let fixture: ComponentFixture<PassagePickerSheetComponent>
  let sheet: jasmine.SpyObj<MatBottomSheetRef<PassagePickerSheetComponent>>
  let abbreviations: boolean
  let preferences: jasmine.SpyObj<PreferencesService>

  const chapters = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      label: String(i + 1),
    }))
  const genesis: PickerBook = {
    id: "gen",
    label: "Génesis",
    name: "Livro do Génesis",
    abbreviation: "Gn",
    chapters: [{ number: 0, label: "", title: "Introdução" }, ...chapters(3)],
  }
  const exodus: PickerBook = {
    id: "exo",
    label: "Êxodo",
    name: "Livro do Êxodo",
    abbreviation: "Ex",
    chapters: chapters(2),
  }
  const psalms: PickerBook = {
    id: "psa",
    label: "Salmos",
    name: "Livro dos Salmos",
    abbreviation: "Sl",
    chapters: [
      {
        number: 23,
        label: "23",
        detail: "22",
        spoken: "Salmo 23, na liturgia 22",
        title: "O bom pastor",
        bookmark: "red",
      },
    ],
  }
  const introduction: PickerBook = {
    id: "geral",
    label: "Introdução",
    name: "Introdução geral",
    abbreviation: "Intro",
    chapters: [],
  }

  function create(current: { bookId: string; chapter: number }): void {
    const data: PassagePickerData = {
      sections: [
        {
          title: "Antigo Testamento",
          groups: [
            { books: [introduction] },
            { title: "Pentateuco", books: [genesis, exodus] },
            { title: "Livros Sapienciais", books: [psalms] },
          ],
        },
      ],
      currentBookId: current.bookId,
      currentChapter: current.chapter,
    }
    sheet = jasmine.createSpyObj("MatBottomSheetRef", ["dismiss"])
    preferences = jasmine.createSpyObj("PreferencesService", [
      "getPickerAbbreviations",
      "setPickerAbbreviations",
    ])
    preferences.getPickerAbbreviations.and.callFake(() => abbreviations)
    TestBed.configureTestingModule({
      imports: [PassagePickerSheetComponent],
      providers: [
        { provide: MAT_BOTTOM_SHEET_DATA, useValue: data },
        { provide: MatBottomSheetRef, useValue: sheet },
        { provide: PreferencesService, useValue: preferences },
      ],
    })
    fixture = TestBed.createComponent(PassagePickerSheetComponent)
    fixture.detectChanges()
  }

  beforeEach(() => {
    abbreviations = false
  })

  const host = () => fixture.nativeElement as HTMLElement
  const title = () => host().querySelector(".picker-title")?.textContent?.trim()
  const tiles = () =>
    Array.from(host().querySelectorAll<HTMLButtonElement>(".tile"))
  const tile = (text: string) =>
    tiles().find((t) => t.textContent?.trim() === text) as HTMLButtonElement
  const click = (element: HTMLElement) => {
    element.click()
    fixture.detectChanges()
  }

  // As the iOS picker: it opens on the chapters of the book being read.
  it("opens on the chapters of the book being read, the current one marked", () => {
    create({ bookId: "gen", chapter: 2 })

    expect(title()).toBe("Livro do Génesis")
    expect(tiles().map((t) => t.textContent?.trim())).toEqual([
      "Introdução",
      "1",
      "2",
      "3",
    ])
    const current = host().querySelector(".tile.current")
    expect(current?.textContent?.trim()).toBe("2")
    expect(current?.getAttribute("aria-current")).toBe("page")
    expect(host().querySelector(".tile.intro")?.textContent?.trim()).toBe(
      "Introdução",
    )
  })

  it("closes with the chapter picked", () => {
    create({ bookId: "gen", chapter: 2 })
    click(tiles()[3])
    expect(sheet.dismiss).toHaveBeenCalledOnceWith({
      bookId: "gen",
      chapter: 3,
    })
  })

  it("shows a psalm's liturgical number, its ribbon and its title", () => {
    create({ bookId: "psa", chapter: 23 })
    const psalm = tiles()[0]

    expect(psalm.querySelector(".tile-detail")?.textContent?.trim()).toBe(
      "(22)",
    )
    expect(
      (psalm.querySelector(".ribbon") as HTMLElement).style.backgroundColor,
    ).toBe("red")
    expect(psalm.getAttribute("aria-label")).toBe(
      "Salmo 23, na liturgia 22, O bom pastor",
    )
  })

  describe("the books", () => {
    beforeEach(() => {
      create({ bookId: "gen", chapter: 2 })
      click(host().querySelector(".back") as HTMLElement)
    })

    const sectionTitles = () =>
      Array.from(host().querySelectorAll(".section-title")).map((h) =>
        h.textContent?.trim(),
      )

    it("lists them by canon group, a testament's introduction under its name", () => {
      expect(title()).toBe("Livros")
      expect(sectionTitles()).toEqual([
        "Antigo Testamento",
        "Pentateuco",
        "Livros Sapienciais",
      ])
      expect(host().querySelector(".tile.current")?.textContent?.trim()).toBe(
        "Génesis",
      )
    })

    it("opens a book's chapters", () => {
      click(tile("Êxodo"))
      expect(title()).toBe("Livro do Êxodo")
      expect(tiles().map((t) => t.textContent?.trim())).toEqual(["1", "2"])
      expect(host().querySelector(".tile.current")).toBeNull()
    })

    it("closes at once on a page without chapters", () => {
      click(tile("Introdução"))
      expect(sheet.dismiss).toHaveBeenCalledOnceWith({ bookId: "geral" })
    })

    it("filters them by name or abbreviation, accents aside", () => {
      const filter = host().querySelector(".filter input") as HTMLInputElement
      filter.value = "exodo"
      filter.dispatchEvent(new Event("input"))
      fixture.detectChanges()
      expect(tiles().map((t) => t.textContent?.trim())).toEqual(["Êxodo"])
      expect(sectionTitles()).toEqual(["Pentateuco"])

      filter.value = "sl"
      filter.dispatchEvent(new Event("input"))
      fixture.detectChanges()
      expect(tiles().map((t) => t.textContent?.trim())).toEqual(["Salmos"])

      filter.value = "xyz"
      filter.dispatchEvent(new Event("input"))
      fixture.detectChanges()
      expect(host().querySelector(".empty")?.textContent).toContain("xyz")
    })

    it("shows them by abbreviation, and remembers it", () => {
      click(host().querySelector(".mode") as HTMLElement)

      expect(tile("Gn")).toBeTruthy()
      expect(host().querySelector(".mode")?.getAttribute("aria-pressed")).toBe(
        "true",
      )
      expect(preferences.setPickerAbbreviations).toHaveBeenCalledOnceWith(true)
    })
  })

  it("opens on the books when the page being read has no chapters", () => {
    abbreviations = true
    create({ bookId: "geral", chapter: 0 })

    expect(title()).toBe("Livros")
    expect(tile("Gn")).toBeTruthy()
  })

  it("closes without a pick", () => {
    create({ bookId: "gen", chapter: 1 })
    click(host().querySelector(".close") as HTMLElement)
    expect(sheet.dismiss).toHaveBeenCalledOnceWith()
  })
})
