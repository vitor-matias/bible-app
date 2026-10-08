import { TestBed } from "@angular/core/testing"
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar"
import { TwoActionSnackComponent } from "./two-action-snackbar.component"

describe("TwoActionSnackComponent", () => {
  let snackBarRefSpy: jasmine.SpyObj<MatSnackBarRef<TwoActionSnackComponent>>

  beforeEach(() => {
    snackBarRefSpy = jasmine.createSpyObj("MatSnackBarRef", ["dismiss"])
  })

  it("should call the return callback before dismissing", () => {
    const returnUrl = jasmine.createSpy("returnUrl")
    const component = new TwoActionSnackComponent(
      { message: "Back", returnUrl },
      snackBarRefSpy,
    )

    component.goBack()

    expect(returnUrl).toHaveBeenCalled()
    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
    expect(
      (returnUrl.calls.mostRecent() as unknown as { invocationOrder: number })
        .invocationOrder,
    ).toBeLessThan(
      (
        snackBarRefSpy.dismiss.calls.mostRecent() as unknown as {
          invocationOrder: number
        }
      ).invocationOrder,
    )
  })

  it("should dismiss even when no return callback is provided", () => {
    const component = new TwoActionSnackComponent(
      { message: "Close" },
      snackBarRefSpy,
    )

    component.goBack()

    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
  })

  it("should dismiss when the close action is used", () => {
    const component = new TwoActionSnackComponent(
      { message: "Close" },
      snackBarRefSpy,
    )

    component.dismiss()

    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
  })

  // A question with Voltar and Fechar under it said the same thing twice.
  it("is one button naming the way back, with a close button", () => {
    const returnUrl = jasmine.createSpy("returnUrl")
    TestBed.configureTestingModule({
      imports: [TwoActionSnackComponent],
      providers: [
        {
          provide: MAT_SNACK_BAR_DATA,
          useValue: { message: "Voltar para Gn 3,5", returnUrl },
        },
        { provide: MatSnackBarRef, useValue: snackBarRefSpy },
      ],
    })
    const fixture = TestBed.createComponent(TwoActionSnackComponent)
    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    const [goBack, close] = Array.from(element.querySelectorAll("button"))

    expect(goBack.textContent).toContain("Voltar para Gn 3,5")
    expect(close.getAttribute("aria-label")).toBe("Fechar")
    goBack.click()
    expect(returnUrl).toHaveBeenCalled()
    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
  })
})
