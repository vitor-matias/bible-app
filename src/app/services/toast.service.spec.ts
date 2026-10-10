import { TestBed } from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { NativeChromeService } from "./native-chrome.service"
import { ToastService } from "./toast.service"

describe("ToastService", () => {
  let snackBar: jasmine.SpyObj<MatSnackBar>
  let nativeChrome: { enabled: boolean; toast: jasmine.Spy }

  function create(native: boolean): ToastService {
    snackBar = jasmine.createSpyObj("MatSnackBar", ["open"])
    nativeChrome = { enabled: native, toast: jasmine.createSpy("toast") }
    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: snackBar },
        { provide: NativeChromeService, useValue: nativeChrome },
      ],
    })
    return TestBed.inject(ToastService)
  }

  it("opens a snackbar on the web, with Fechar for 3 s by default", () => {
    create(false).show("Copiado")
    expect(snackBar.open).toHaveBeenCalledWith("Copiado", "Fechar", {
      duration: 3000,
    })
    expect(nativeChrome.toast).not.toHaveBeenCalled()
  })

  it("keeps the caller's button and duration on the web", () => {
    create(false).show("Erro", { action: "OK", duration: 4000 })
    expect(snackBar.open).toHaveBeenCalledWith("Erro", "OK", { duration: 4000 })
  })

  it("shows the native glass toast in the iOS app", () => {
    const toast = create(true)
    toast.show("Copiado")
    toast.show("Erro", { action: "OK" })

    expect(nativeChrome.toast).toHaveBeenCalledWith("Copiado")
    // The web's button label doesn't make a native one.
    expect(nativeChrome.toast).toHaveBeenCalledWith("Erro")
    expect(snackBar.open).not.toHaveBeenCalled()
  })
})
