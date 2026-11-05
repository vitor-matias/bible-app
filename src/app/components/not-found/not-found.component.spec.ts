import { TestBed } from "@angular/core/testing"
import { Meta } from "@angular/platform-browser"
import { provideRouter } from "@angular/router"
import { NotFoundComponent } from "./not-found.component"

describe("NotFoundComponent", () => {
  it("says so, links to the book list and is noindexed", () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
    const fixture = TestBed.createComponent(NotFoundComponent)
    fixture.detectChanges()
    const el: HTMLElement = fixture.nativeElement
    expect(el.querySelector("h1")?.textContent).toBe("Capítulo não encontrado")
    expect(el.querySelector("a")?.getAttribute("href")).toBe("/livros")
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe(
      "noindex",
    )
  })
})
