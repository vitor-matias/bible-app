import { TestBed } from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { provideRouter, Router } from "@angular/router"
import { TwoActionSnackComponent } from "../components/two-action-snackbar/two-action-snackbar.component"
import { BookService } from "./book.service"
import { NativeChromeService } from "./native-chrome.service"
import { ToastService } from "./toast.service"

describe("ToastService", () => {
  let snackBar: jasmine.SpyObj<MatSnackBar>
  let nativeChrome: { enabled: boolean; toast: jasmine.Spy }

  function create(native: boolean): ToastService {
    snackBar = jasmine.createSpyObj("MatSnackBar", [
      "open",
      "openFromComponent",
    ])
    nativeChrome = { enabled: native, toast: jasmine.createSpy("toast") }
    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: snackBar },
        { provide: NativeChromeService, useValue: nativeChrome },
        provideRouter([]),
        {
          provide: BookService,
          useValue: {
            findBook: () => ({ id: "gen", shortName: "Gn" }) as Book,
            getUrlAbrv: () => "gn",
          },
        },
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

  describe("showReturn", () => {
    const returnSnack = () =>
      snackBar.openFromComponent.calls.mostRecent().args[1]?.data as {
        message: string
        onTap: () => void
      }

    it("offers the way back to the verse in a snackbar", () => {
      const toast = create(false)
      const navigate = spyOn(TestBed.inject(Router), "navigate").and.resolveTo(
        true,
      )

      toast.showReturn({ bookId: "gen", chapterNumber: 3, number: 5 })

      expect(snackBar.openFromComponent).toHaveBeenCalledOnceWith(
        TwoActionSnackComponent,
        jasmine.anything(),
      )
      expect(returnSnack().message).toBe("Voltar para Gn 3,5")
      returnSnack().onTap()
      expect(navigate).toHaveBeenCalledWith(["gn", 3], {
        queryParams: { verseStart: 5, highlight: false },
      })
    })

    it("goes back to verse 1 from before the first verse", () => {
      create(false).showReturn({ bookId: "gen", chapterNumber: 1, number: 0 })
      expect(returnSnack().message).toBe("Voltar para Gn 1,1")
    })

    it("offers the way back as a glass toast that is a button in the iOS app", () => {
      const toast = create(true)
      const navigate = spyOn(TestBed.inject(Router), "navigate").and.resolveTo(
        true,
      )

      toast.showReturn({ bookId: "gen", chapterNumber: 3, number: 5 })

      expect(snackBar.openFromComponent).not.toHaveBeenCalled()
      expect(nativeChrome.toast).toHaveBeenCalledOnceWith(
        "Voltar para Gn 3,5",
        { symbol: "arrow.uturn.backward", onTap: jasmine.any(Function) },
      )
      nativeChrome.toast.calls.mostRecent().args[1].onTap()
      expect(navigate).toHaveBeenCalledWith(["gn", 3], {
        queryParams: { verseStart: 5, highlight: false },
      })
    })
  })
})
