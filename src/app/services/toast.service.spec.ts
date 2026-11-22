import { Location, LocationStrategy, PlatformLocation } from "@angular/common"
import {
  MockPlatformLocation,
  provideLocationMocks,
} from "@angular/common/testing"
import { ApplicationRef, Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MATERIAL_ANIMATIONS } from "@angular/material/core"
import { MatDialog } from "@angular/material/dialog"
import {
  MatSnackBar,
  type MatSnackBarDismiss,
  type MatSnackBarRef,
} from "@angular/material/snack-bar"
import { provideRouter, Router } from "@angular/router"
import { Subject } from "rxjs"
import type { Mock } from "vitest"
import { TwoActionSnackComponent } from "../components/two-action-snackbar/two-action-snackbar.component"
import { createSpyObj, lastCall, type SpyObj } from "../testing/spy-obj"
import { BookService } from "./book.service"
import { DepthLocationStrategy } from "./depth-location-strategy"
import { NativeChromeService } from "./native-chrome.service"
import { CHAPTER_STEP, ToastService } from "./toast.service"

@Component({ template: "" })
class PassagePage {}

describe("ToastService", () => {
  let snackBar: SpyObj<MatSnackBar>
  let snackRef: SpyObj<MatSnackBarRef<TwoActionSnackComponent>>
  let snackClosed: Subject<MatSnackBarDismiss>
  let nativeChrome: {
    enabled: boolean
    toast: Mock
  }
  /** What takes the glass toast down (NativeChromeService.toast). */
  let hideToast: Mock

  function create(native: boolean, appHistory = false): ToastService {
    snackClosed = new Subject()
    snackRef = createSpyObj("MatSnackBarRef", ["dismiss", "afterDismissed"])
    snackRef.afterDismissed.mockReturnValue(snackClosed)
    snackBar = createSpyObj("MatSnackBar", ["open", "openFromComponent"])
    snackBar.openFromComponent.mockReturnValue(snackRef)
    hideToast = vi.fn().mockName("hideToast")
    nativeChrome = {
      enabled: native,
      toast: vi.fn().mockName("toast").mockReturnValue(hideToast),
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: snackBar },
        { provide: NativeChromeService, useValue: nativeChrome },
        provideRouter([
          { path: ":book/:chapter", component: PassagePage },
          { path: "**", component: PassagePage },
        ]),
        // History to step back through: the app's own, which counts the
        // entries, over a browser's.
        appHistory
          ? [
              { provide: PlatformLocation, useClass: MockPlatformLocation },
              { provide: LocationStrategy, useClass: DepthLocationStrategy },
            ]
          : provideLocationMocks(),
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
    expect(snackBar.open).toHaveBeenCalledWith("Erro", "OK", {
      duration: 4000,
    })
  })

  describe("over a sheet opened after it", () => {
    function popover(child: string): HTMLElement {
      const element = document.createElement("div")
      element.popover = "manual"
      element.style.cssText =
        "position: fixed; inset: 0; margin: 0; width: 100vw; height: 100vh"
      element.append(document.createElement(child))
      document.body.append(element)
      element.showPopover()
      return element
    }

    const onTop = () => document.elementFromPoint(100, 100)

    it("goes back on top, for real", () => {
      const service = create(false)
      const toast = popover("mat-snack-bar-container")
      const sheet = popover("mat-bottom-sheet-container")
      expect(onTop()).toBe(sheet)

      service.bringToFront()

      expect(onTop()).toBe(toast)
      toast.remove()
      sheet.remove()
    })

    it("does nothing without a toast showing", () => {
      expect(() => create(false).bringToFront()).not.toThrow()
    })
  })

  describe("the way back to the index", () => {
    it("reopens the theme from a snackbar", () => {
      const service = create(false)
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)

      service.showReturnToIndex("amor")

      const data = snackBar.openFromComponent.mock.lastCall?.[1]?.data as {
        message: string
        returnUrl: () => void
      }
      expect(data.message).toBe("Voltar para o Índice")
      data.returnUrl()
      expect(navigate).toHaveBeenCalledWith(["/indice", "amor"], {})
    })

    it("is a button on the glass toast in the native apps", () => {
      const service = create(true)

      service.showReturnToIndex("amor")

      expect(nativeChrome.toast).toHaveBeenCalledWith(
        "Voltar para o Índice",
        expect.objectContaining({ returnToPage: true }),
      )
    })
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

  it("offers the way back to the reading plan", () => {
    const service = create(false)
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true)
    service.showReturnToPlan()
    const data = snackBar.openFromComponent.mock.lastCall?.[1]?.data as {
      message: string
      returnUrl: () => void
    }
    expect(data.message).toBe("Voltar ao plano de leitura")
    data.returnUrl()
    expect(navigate).toHaveBeenCalledWith(["/365"], {})
  })

  describe("showReturn", () => {
    const returnSnack = () =>
      lastCall(vi.mocked(snackBar.openFromComponent))[1]?.data as {
        message: string
        returnUrl: () => void
      }

    it("offers the way back to the verse in a snackbar", () => {
      const toast = create(false)
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)

      toast.showReturn({ bookId: "gen", chapterNumber: 3, number: 5 })

      expect(snackBar.openFromComponent).toHaveBeenCalledTimes(1)

      expect(snackBar.openFromComponent).toHaveBeenCalledWith(
        TwoActionSnackComponent,
        expect.anything(),
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
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)

      toast.showReturn({ bookId: "gen", chapterNumber: 3, number: 5 })

      expect(snackBar.openFromComponent).not.toHaveBeenCalled()
      expect(nativeChrome.toast).toHaveBeenCalledTimes(1)
      expect(nativeChrome.toast).toHaveBeenCalledWith("Voltar para Gn 3,5", {
        symbol: "arrow.uturn.backward",
        onTap: expect.any(Function),
        // Android takes the way back down once the reader reads on.
        returnToPage: true,
      })
      lastCall(vi.mocked(nativeChrome.toast))[1].onTap()
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

      /** The reader's ‹ › arrows, a swipe or an arrow key. */
      const step = (url: string) =>
        router.navigateByUrl(url, { info: CHAPTER_STEP })

      it("keeps it while they read on with the chapter arrows", async () => {
        await followReference(false)
        await step("/jo/2")
        await step("/jo/3")

        expect(snackRef.dismiss).not.toHaveBeenCalled()
      })

      it("takes it down once reading on brings them back to its chapter", async () => {
        start(false)
        await router.navigateByUrl("/gn/1")
        toast.showReturn({ bookId: "gen", chapterNumber: 1, number: 1 })
        await router.navigateByUrl("/gn/3?verseStart=2")
        await step("/gn/2")
        expect(snackRef.dismiss).not.toHaveBeenCalled()

        await step("/gn/1")

        expect(snackRef.dismiss).toHaveBeenCalledTimes(1)
      })

      // Owner's decision: it survived the passage picker, a search result, a
      // ribbon, another reference. Only reading on keeps it.
      for (const native of [false, true]) {
        it(`takes it down on any other way to a passage${native ? " in the apps" : ""}`, async () => {
          await followReference(native)

          // The passage picker, a search result, a ribbon or another reference.
          await router.navigateByUrl("/jo/5?verseStart=2")

          if (native) expect(hideToast).toHaveBeenCalledTimes(1)
          else expect(snackRef.dismiss).toHaveBeenCalledTimes(1)
        })
      }

      it("takes it down on a passage after a step", async () => {
        await followReference(false)
        await step("/jo/2")

        await router.navigateByUrl("/ex/3")

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

      // A ribbon on a theme: "/indice/amor" has a book's two segments.
      it("takes it down on the way to a theme of the index", async () => {
        await followReference(false)

        await router.navigateByUrl("/indice/amor")

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

      describe("in the app's history", () => {
        let platform: MockPlatformLocation

        async function followFrom(origin: string): Promise<void> {
          toast = create(false, true)
          router = TestBed.inject(Router)
          platform = TestBed.inject(PlatformLocation) as MockPlatformLocation
          router.initialNavigation()
          await router.navigateByUrl("/gn/4")
          await router.navigateByUrl(origin)
          toast.showReturn({ bookId: "gen", chapterNumber: 5, number: 1 })
          await router.navigateByUrl("/jo/1?verseStart=1&verseEnd=3")
        }

        const depth = () =>
          (platform.getState() as { appDepth?: number }).appDepth

        // It pushed /gn/5?verseStart=1…: Back afterwards returned to the
        // reference rather than to the page before.
        it("steps back to the entry the reference was followed from", async () => {
          await followFrom("/gn/5")
          const before = depth()

          returnSnack().returnUrl()
          await settle()

          expect(router.url).toBe("/gn/5?verseStart=1&highlight=false")
          expect(depth()).toBe((before ?? 0) - 1)
          TestBed.inject(Location).back()
          await settle()
          expect(router.url).toBe("/gn/4")
        })

        // On the website a verse's notes sheet keeps an entry of its own on
        // top (BackButtonService), which the reference's page takes over: the
        // way back counted from that entry, went there anew instead of back,
        // and Back afterwards returned to the reference.
        it("steps back over a notes sheet's entry to the page", async () => {
          toast = create(false, true)
          router = TestBed.inject(Router)
          platform = TestBed.inject(PlatformLocation) as MockPlatformLocation
          router.initialNavigation()
          await router.navigateByUrl("/gn/4")
          await router.navigateByUrl("/gn/5")
          const page = depth() ?? 0
          platform.pushState(
            {
              ...(platform.getState() as object),
              appDepth: page + 1,
              appPanel: true,
            },
            "",
            platform.url,
          )
          toast.showReturn({ bookId: "gen", chapterNumber: 5, number: 1 })
          await router.navigateByUrl("/jo/1?verseStart=1&verseEnd=3")
          expect(depth()).toBe(page + 1)

          returnSnack().returnUrl()
          await settle()

          expect(router.url).toBe("/gn/5?verseStart=1&highlight=false")
          expect(depth()).toBe(page)
          TestBed.inject(Location).back()
          await settle()
          expect(router.url).toBe("/gn/4")
        })

        // A citation with notes= opens the notes on the reference's page after
        // the way back shows: «Voltar» counted the sheet's entry as a page,
        // went there anew over it, and Back afterwards returned to the reference.
        it("steps back over a sheet opened on the reference's page", async () => {
          await followFrom("/gn/5")
          const reference = depth() ?? 0
          platform.pushState(
            {
              ...(platform.getState() as object),
              appDepth: reference + 1,
              appPanel: true,
            },
            "",
            platform.url,
          )

          returnSnack().returnUrl()
          await settle()

          expect(router.url).toBe("/gn/5?verseStart=1&highlight=false")
          expect(depth()).toBe(reference - 1)
          TestBed.inject(Location).back()
          await settle()
          expect(router.url).toBe("/gn/4")
        })

        it("goes there anew once the reader has read on", async () => {
          await followFrom("/gn/5")
          await router.navigateByUrl("/jo/2")
          const before = depth()

          returnSnack().returnUrl()
          await settle()

          expect(router.url).toBe("/gn/5?verseStart=1&highlight=false")
          expect(depth()).toBe((before ?? 0) + 1)
        })

        // From /indice with every theme open, back then onto the theme
        // pushed /indice/amor: Back then led to the index again.
        it("steps back to the index and opens the theme in that entry", async () => {
          toast = create(false, true)
          router = TestBed.inject(Router)
          platform = TestBed.inject(PlatformLocation) as MockPlatformLocation
          router.initialNavigation()
          await router.navigateByUrl("/gn/4")
          await router.navigateByUrl("/indice")
          const origin = depth()
          toast.showReturnToIndex("amor")
          await router.navigateByUrl("/gn/1")

          returnSnack().returnUrl()
          await settle()

          expect(router.url).toBe("/indice/amor")
          expect(depth()).toBe(origin)
        })
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

// "Voltar para …" stayed bright under a dialog's or a menu's backdrop, which
// took its taps: it looked tappable and wasn't. Over the notes it is on top.
describe("a toast under an overlay shown after it", () => {
  let service: ToastService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MATERIAL_ANIMATIONS,
          useValue: { animationsDisabled: true },
        },
        { provide: NativeChromeService, useValue: { enabled: false } },
        { provide: BookService, useValue: {} },
        provideRouter([]),
      ],
    })
    service = TestBed.inject(ToastService)
    TestBed.inject(MatSnackBar).open("Voltar para Gn 1,1", "Fechar")
    TestBed.tick()
  })

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll()
    TestBed.inject(MatBottomSheet).dismiss()
    TestBed.inject(MatSnackBar).dismiss()
  })

  const toast = () =>
    document.querySelector("mat-snack-bar-container") as HTMLElement
  /** What a tap on the toast's middle reaches. */
  const tapped = () => {
    const box = toast().getBoundingClientRect()
    return document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    )
  }
  /** Its content faded: its own opacity is its entry animation's. */
  const faded = () =>
    Number(
      getComputedStyle(
        toast().querySelector(".mdc-snackbar__surface > *") as Element,
      ).opacity,
    ) < 1
  const backdrops = (count: number) =>
    vi.waitFor(() =>
      expect(
        document.querySelectorAll(".cdk-overlay-backdrop-showing").length,
      ).toBe(count),
    )

  it("is faded under a dialog's backdrop, which takes its taps", async () => {
    expect(toast().contains(tapped())).toBe(true)
    expect(faded()).toBe(false)

    TestBed.inject(MatDialog).open(PassagePage)
    TestBed.tick()
    await backdrops(1)

    expect(tapped()?.classList).toContain("cdk-overlay-backdrop")
    expect(faded()).toBe(true)
  })

  it("is bright and tappable over the notes, and faded under a dialog over them", async () => {
    TestBed.inject(MatBottomSheet).open(PassagePage)
    TestBed.tick()
    await backdrops(1)
    service.bringToFront()

    expect(toast().contains(tapped())).toBe(true)
    expect(faded()).toBe(false)

    TestBed.inject(MatDialog).open(PassagePage)
    TestBed.tick()
    await backdrops(2)

    expect(toast().contains(tapped())).toBe(false)
    expect(faded()).toBe(true)
  })
})
