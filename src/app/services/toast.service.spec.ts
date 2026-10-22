import { Location } from "@angular/common"
import { provideLocationMocks } from "@angular/common/testing"
import { ApplicationRef, Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import {
  MatSnackBar,
  type MatSnackBarDismiss,
  type MatSnackBarRef,
} from "@angular/material/snack-bar"
import { provideRouter, Router } from "@angular/router"
import { Subject } from "rxjs"
import { TwoActionSnackComponent } from "../components/two-action-snackbar/two-action-snackbar.component"
import { BookService } from "./book.service"
import { NativeChromeService } from "./native-chrome.service"
import { ToastService } from "./toast.service"

@Component({ template: "" })
class PassagePage {}

describe("ToastService", () => {
  let snackBar: jasmine.SpyObj<MatSnackBar>
  let snackRef: jasmine.SpyObj<MatSnackBarRef<TwoActionSnackComponent>>
  let snackClosed: Subject<MatSnackBarDismiss>
  let nativeChrome: { enabled: boolean; toast: jasmine.Spy }
  /** What takes the glass toast down (NativeChromeService.toast). */
  let hideToast: jasmine.Spy

  function create(native: boolean): ToastService {
    snackClosed = new Subject()
    snackRef = jasmine.createSpyObj("MatSnackBarRef", [
      "dismiss",
      "afterDismissed",
    ])
    snackRef.afterDismissed.and.returnValue(snackClosed)
    snackBar = jasmine.createSpyObj("MatSnackBar", [
      "open",
      "openFromComponent",
    ])
    snackBar.openFromComponent.and.returnValue(snackRef)
    hideToast = jasmine.createSpy("hideToast")
    nativeChrome = {
      enabled: native,
      toast: jasmine.createSpy("toast").and.returnValue(hideToast),
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: snackBar },
        { provide: NativeChromeService, useValue: nativeChrome },
        provideRouter([
          { path: ":book/:chapter", component: PassagePage },
          { path: "**", component: PassagePage },
        ]),
        // History to step back through.
        provideLocationMocks(),
        {
          provide: BookService,
          useValue: {
            findBook: () => ({ id: "gen", shortName: "Gn" }) as Book,
            getUrlAbrv: () => "gn",
            parseChapterUrlSegment:
              BookService.prototype.parseChapterUrlSegment,
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
        returnUrl: () => void
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
      returnSnack().returnUrl()
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

    describe("once the reader has gone back by another route", () => {
      let toast: ToastService
      let router: Router

      /** Lets the router finish, a popstate's navigation too. */
      async function settle(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve))
        await TestBed.inject(ApplicationRef).whenStable()
      }

      /** As bootstrapping does: the router then follows history's steps. */
      function start(native: boolean): void {
        toast = create(native)
        router = TestBed.inject(Router)
        router.initialNavigation()
      }

      /** Gn 1,1's heading reference "Jo 1,1-3", followed. */
      async function followReference(native: boolean): Promise<void> {
        start(native)
        await router.navigateByUrl("/gn/1")
        toast.showReturn({ bookId: "gen", chapterNumber: 1, number: 1 })
        await router.navigateByUrl("/jo/1?verseStart=1&verseEnd=3")
      }

      async function back(): Promise<void> {
        TestBed.inject(Location).back()
        await settle()
      }

      it("takes the snackbar down on a step back through history", async () => {
        // The back gesture, Android's back button and the browser's.
        await followReference(false)
        expect(snackRef.dismiss).not.toHaveBeenCalled()

        await back()

        expect(router.url).toBe("/gn/1")
        expect(snackRef.dismiss).toHaveBeenCalledTimes(1)
      })

      it("takes the glass toast down in the iOS app", async () => {
        await followReference(true)
        expect(hideToast).not.toHaveBeenCalled()

        await back()

        expect(hideToast).toHaveBeenCalledTimes(1)
      })

      it("keeps it while they read on, until they come back to its chapter", async () => {
        await followReference(false)
        await router.navigateByUrl("/jo/2")
        expect(snackRef.dismiss).not.toHaveBeenCalled()

        // The passage picker, say.
        await router.navigateByUrl("/gn/1")

        expect(snackRef.dismiss).toHaveBeenCalledTimes(1)
      })

      // On iOS "Voltar para Gn 1,1" stayed over the search page.
      it("takes it down when they leave the text for search", async () => {
        await followReference(true)

        await router.navigateByUrl("/search?q=luz")

        expect(hideToast).toHaveBeenCalledTimes(1)
      })

      it("takes the snackbar down on the way to the book list", async () => {
        await followReference(false)

        await router.navigateByUrl("/livros")

        expect(snackRef.dismiss).toHaveBeenCalledTimes(1)
      })

      it("keeps it after a reference within the chapter", async () => {
        start(false)
        await router.navigateByUrl("/gn/1")
        toast.showReturn({ bookId: "gen", chapterNumber: 1, number: 1 })

        await router.navigateByUrl("/gn/1?verseStart=27")

        expect(snackRef.dismiss).not.toHaveBeenCalled()
      })

      it("still takes them back with its own button", async () => {
        await followReference(false)

        await returnSnack().returnUrl()
        await settle()

        expect(router.url).toBe("/gn/1?verseStart=1&highlight=false")
      })

      it("stops watching once the snackbar has closed", async () => {
        await followReference(false)
        snackClosed.next({ dismissedByAction: false })

        await back()

        expect(snackRef.dismiss).not.toHaveBeenCalled()
      })

      it("leaves a toast that has replaced it alone", async () => {
        await followReference(true)
        toast.show("Copiado")

        await back()

        expect(hideToast).not.toHaveBeenCalled()
      })
    })
  })
})
