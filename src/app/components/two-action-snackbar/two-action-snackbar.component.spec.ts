import { TestBed } from "@angular/core/testing"
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { TwoActionSnackComponent } from "./two-action-snackbar.component"

describe("TwoActionSnackComponent", () => {
  let snackBarRefSpy: SpyObj<MatSnackBarRef<TwoActionSnackComponent>>

  beforeEach(() => {
    snackBarRefSpy = createSpyObj("MatSnackBarRef", ["dismiss"])
  })

  function create(data: { message: string; returnUrl?: () => void }) {
    TestBed.configureTestingModule({
      imports: [TwoActionSnackComponent],
      providers: [
        { provide: MAT_SNACK_BAR_DATA, useValue: data },
        { provide: MatSnackBarRef, useValue: snackBarRefSpy },
      ],
    })
    return TestBed.createComponent(TwoActionSnackComponent).componentInstance
  }

  it("should call the return callback before dismissing", () => {
    const returnUrl = vi.fn().mockName("returnUrl")
    const component = create({ message: "Back", returnUrl })

    component.goBack()

    expect(returnUrl).toHaveBeenCalled()
    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
    expect(returnUrl.mock.invocationCallOrder[0]).toBeLessThan(
      snackBarRefSpy.dismiss.mock.invocationCallOrder[0],
    )
  })

  it("should dismiss even when no return callback is provided", () => {
    const component = create({ message: "Close" })

    component.goBack()

    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
  })

  it("should dismiss when the close action is used", () => {
    const component = create({ message: "Close" })

    component.dismiss()

    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
  })

  // A question with Voltar and Fechar under it said the same thing twice.
  it("is one button naming the way back, with a close button", () => {
    const returnUrl = vi.fn().mockName("returnUrl")
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
