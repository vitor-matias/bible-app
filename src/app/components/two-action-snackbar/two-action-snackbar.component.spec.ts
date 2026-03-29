import { MatSnackBarRef } from "@angular/material/snack-bar"
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
      (
        returnUrl.calls.mostRecent() as unknown as { invocationOrder: number }
      ).invocationOrder,
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
})
