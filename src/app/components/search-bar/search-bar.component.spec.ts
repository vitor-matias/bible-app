import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { SearchBarComponent } from "./search-bar.component"

/** WCAG relative luminance of a computed `rgb()`/`rgba()` colour. */
function luminance(cssColor: string): number {
  const [r, g, b] = (cssColor.match(/[\d.]+/g) ?? [])
    .slice(0, 3)
    .map((value) => {
      const channel = Number(value) / 255
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

describe("SearchBarComponent", () => {
  let component: SearchBarComponent
  let fixture: ComponentFixture<SearchBarComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchBarComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(SearchBarComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  afterEach(() => document.documentElement.classList.remove("dark-theme"))

  // The field is white in both themes, but its text colour is the browser's
  // default, which follows the page's color-scheme. .dark-theme sets
  // color-scheme: dark, so typed text turned white on the white field and the
  // box looked empty.
  for (const theme of ["light", "dark"]) {
    it(`keeps typed text readable on its field in ${theme} mode`, () => {
      document.documentElement.classList.toggle("dark-theme", theme === "dark")

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        ".search-input",
      ) as HTMLInputElement
      const style = getComputedStyle(input)

      expect(
        contrastRatio(style.color, style.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5)
    })
  }

  // The reader header pins its buttons 8px from the viewport edge. This toolbar
  // lays its buttons out in flow instead, so Material's own 16px toolbar inset
  // stacked on .content's 8px and left them 24px in — visibly out of line with
  // every other page.
  it("insets its buttons like the reader header, not 16px further in", () => {
    const element = fixture.nativeElement as HTMLElement
    const toolbar = element.querySelector("mat-toolbar") as HTMLElement
    const content = element.querySelector(".content") as HTMLElement

    const toolbarStyle = getComputedStyle(toolbar)
    expect(toolbarStyle.paddingLeft).toBe("0px")
    expect(toolbarStyle.paddingRight).toBe("0px")

    const contentStyle = getComputedStyle(content)
    expect(contentStyle.paddingLeft).toBe("8px")
    expect(contentStyle.paddingRight).toBe("8px")
  })

  // Same reason: the header's buttons take Material's default 40px, and at
  // 36px these read as a different, shorter control on an otherwise identical
  // toolbar. The input matches so the row reads as one.
  it("sizes its controls like the reader header's buttons", () => {
    const element = fixture.nativeElement as HTMLElement
    const heights = [".backButton", ".searchButton", ".search-input"].map(
      (selector) =>
        getComputedStyle(element.querySelector(selector) as HTMLElement).height,
    )

    expect(heights).toEqual(["40px", "40px", "40px"])
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should prefill the query from the value input", () => {
    component.value = "Salmo 23"
    expect(component.query).withContext("after setter").toBe("Salmo 23")
    fixture.detectChanges()
    expect(component.query).withContext("after CD").toBe("Salmo 23")
  })

  it("should clear the query when value is nullish", () => {
    component.value = "old query"
    expect(component.query).toBe("old query")

    component.value = null as unknown as string
    expect(component.query).toBe("")

    component.value = "another query"
    component.value = undefined as unknown as string
    expect(component.query).toBe("")
  })
})
