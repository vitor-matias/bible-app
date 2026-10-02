import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { provideNoopAnimations } from "@angular/platform-browser/animations"

// Rules in src/styles.css for overlays, which render outside any component.
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
})
