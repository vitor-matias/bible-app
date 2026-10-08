import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { provideNoopAnimations } from "@angular/platform-browser/animations"

// Rules in src/styles.css that reach across components.
describe("global styles", () => {
  @Component({ template: "" })
  class HostComponent {}

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideNoopAnimations()],
    })
    document.documentElement.style.setProperty("--app-inset-bottom", "100px")
  })

  afterEach(() => {
    TestBed.inject(MatSnackBar).dismiss()
    document.documentElement.style.removeProperty("--app-inset-bottom")
  })

  // The search result counts appeared on top of the Android navigation bar.
  it("lifts snack bars above the bottom system inset", () => {
    TestBed.createComponent(HostComponent)
    TestBed.inject(MatSnackBar).open("3 resultados", "Fechar")

    const snackBar = document.querySelector(
      ".mat-mdc-snack-bar-container",
    ) as HTMLElement
    expect(snackBar).toBeTruthy()
    expect(getComputedStyle(snackBar).marginBottom).toBe("108px")
  })

  // A section title split as "MINISTÉ-RIO" looked like a misprint.
  describe("hyphenation in the reader", () => {
    let book: HTMLElement

    beforeEach(() => {
      book = document.createElement("div")
      book.className = "bookBlock"
      // As the reader's own (component-scoped) .bookBlock rule sets it.
      book.style.hyphens = "auto"
      book.innerHTML = `
        <p class="text">No princípio havia o Verbo</p>
        <h3>PREPARAÇÃO DO MINISTÉRIO DE JESUS</h3>
        <verse-section><span class="section">Pregação de João Batista</span></verse-section>`
      document.body.appendChild(book)
    })

    afterEach(() => book.remove())

    const hyphens = (selector: string) =>
      getComputedStyle(book.querySelector(selector) as HTMLElement).hyphens

    it("hyphenates the running text", () => {
      expect(hyphens(".text")).toBe("auto")
    })

    it("never hyphenates headings or section titles", () => {
      expect(hyphens("h3")).toBe("manual")
      expect(hyphens("verse-section .section")).toBe("manual")
    })
  })
})
