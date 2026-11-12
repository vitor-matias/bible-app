import { TestBed } from "@angular/core/testing"
import { MatDialog, type MatDialogRef } from "@angular/material/dialog"
import { Capacitor } from "@capacitor/core"
import { Subject } from "rxjs"
import type { Mock } from "vitest"
import {
  OnboardingComponent,
  type OnboardingResult,
} from "../components/onboarding/onboarding.component"
import type { NativeOnboardingStep } from "../components/onboarding/onboarding-content"
import { createSpyObj, lastCall, type SpyObj } from "../testing/spy-obj"
import { AnalyticsService } from "./analytics.service"
import { NativeChromeService } from "./native-chrome.service"
import { FIRST_LAUNCH_DELAY_MS, OnboardingService } from "./onboarding.service"
import { PreferencesService } from "./preferences.service"

describe("OnboardingService", () => {
  let service: OnboardingService
  let dialogSpy: SpyObj<MatDialog>
  let dialogRefSpy: SpyObj<MatDialogRef<OnboardingComponent>>
  let preferencesSpy: SpyObj<PreferencesService>
  let analyticsSpy: SpyObj<AnalyticsService>
  let afterClosed$: Subject<OnboardingResult | undefined>

  beforeEach(() => {
    afterClosed$ = new Subject()
    dialogRefSpy = createSpyObj("MatDialogRef", ["afterClosed"])
    dialogRefSpy.afterClosed.mockReturnValue(afterClosed$.asObservable())
    dialogSpy = createSpyObj("MatDialog", ["open"])
    dialogSpy.open.mockReturnValue(dialogRefSpy)
    preferencesSpy = createSpyObj("PreferencesService", [
      "getOnboardingSeen",
      "setOnboardingSeen",
      "getNativeBarsOnboardingSeen",
      "setNativeBarsOnboardingSeen",
    ])
    preferencesSpy.getOnboardingSeen.mockReturnValue(false)
    preferencesSpy.getNativeBarsOnboardingSeen.mockReturnValue(false)
    analyticsSpy = createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.mockResolvedValue(undefined)

    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialog, useValue: dialogSpy },
        { provide: PreferencesService, useValue: preferencesSpy },
        { provide: AnalyticsService, useValue: analyticsSpy },
      ],
    })
    service = TestBed.inject(OnboardingService)
  })

  describe("showOnFirstLaunch", () => {
    it("opens the wizard on a first visit once the reader has had time to paint", async () => {
      vi.useFakeTimers()
      expect(service.showOnFirstLaunch("")).toBe(true)
      expect(dialogSpy.open).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)

      const [component, config] = lastCall(vi.mocked(dialogSpy.open))
      expect(component).toBe(OnboardingComponent)
      // The wizard reads no dialog data; the source only feeds analytics.
      expect(config?.data).toBeUndefined()
      expect(analyticsSpy.track).toHaveBeenCalledWith("onboarding_open", {
        source: "first_launch",
      })
    })

    it("stays quiet once the wizard has been seen", async () => {
      vi.useFakeTimers()
      preferencesSpy.getOnboardingSeen.mockReturnValue(true)

      expect(service.showOnFirstLaunch("")).toBe(false)
      await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)

      expect(dialogSpy.open).not.toHaveBeenCalled()
    })

    it("leaves the policy alone when an app link opens it before the wizard", async () => {
      vi.useFakeTimers()
      expect(service.showOnFirstLaunch("")).toBe(true)
      const before = window.location.pathname
      history.replaceState(null, "", "/privacidade")
      try {
        await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)
        expect(dialogSpy.open).not.toHaveBeenCalled()
      } finally {
        history.replaceState(null, "", before)
      }
    })

    it("does not reopen once the timer fires after the wizard was already seen", async () => {
      vi.useFakeTimers()
      expect(service.showOnFirstLaunch("")).toBe(true)

      // The user opens the wizard from the menu and dismisses it before the
      // first-launch timer fires, which marks it seen — the stale timer must
      // not undo that and reopen it a moment later.
      service.open("menu")
      preferencesSpy.getOnboardingSeen.mockReturnValue(true)
      afterClosed$.next(undefined)
      dialogSpy.open.mockClear()

      await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)

      expect(dialogSpy.open).not.toHaveBeenCalled()
    })

    it("does not get in the way of a share-target launch", async () => {
      vi.useFakeTimers()
      expect(service.showOnFirstLaunch("?text=Jo%203,16")).toBe(false)
      expect(
        service.showOnFirstLaunch(
          "?url=https%3A%2F%2Fbiblia.capuchinhos.org%2Fjo%2F3",
        ),
      ).toBe(false)
      // A share sheet that only sends a title (no url/text) is still a share,
      // matching AppComponent.handleShareTarget's three-field detection.
      expect(service.showOnFirstLaunch("?title=Salmo%2023")).toBe(false)
      await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)

      expect(dialogSpy.open).not.toHaveBeenCalled()
    })
  })

  describe("open", () => {
    it("opens the wizard with an accessible, size-constrained dialog", () => {
      const ref = service.open("menu")

      expect(ref).toBe(dialogRefSpy)
      expect(dialogSpy.open).toHaveBeenCalledWith(
        OnboardingComponent,
        expect.objectContaining({
          ariaLabelledBy: "onboarding-title",
          maxHeight: "90vh",
        }),
      )
    })

    it("reuses the open dialog instead of stacking a second one", () => {
      service.open("menu")
      service.open("first_launch")

      expect(dialogSpy.open).toHaveBeenCalledTimes(1)
    })

    it("remembers the wizard as seen when it is completed", () => {
      service.open("menu")

      afterClosed$.next({ completed: true, lastStep: "install" })

      expect(preferencesSpy.setOnboardingSeen).toHaveBeenCalledWith(true)
      expect(analyticsSpy.track).toHaveBeenCalledWith("onboarding_close", {
        source: "menu",
        completed: true,
        lastStep: "install",
      })
    })

    it("remembers the wizard as seen even when dismissed with the backdrop", () => {
      service.open("first_launch")

      afterClosed$.next(undefined)

      expect(preferencesSpy.setOnboardingSeen).toHaveBeenCalledWith(true)
      expect(analyticsSpy.track).toHaveBeenCalledWith("onboarding_close", {
        source: "first_launch",
        completed: false,
        lastStep: undefined,
      })
    })

    it("can be opened again after it closes", () => {
      service.open("menu")
      afterClosed$.next(undefined)

      service.open("menu")

      expect(dialogSpy.open).toHaveBeenCalledTimes(2)
    })
  })

  // The native apps show the steps themselves instead of the dialog.
  describe("in the native apps", () => {
    let showOnboarding: Mock
    let finish: (result: OnboardingResult) => void

    beforeEach(() => {
      showOnboarding = vi
        .fn()
        .mockName("showOnboarding")
        .mockImplementation(
          () =>
            new Promise<OnboardingResult>((resolve) => {
              finish = resolve
            }),
        )
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        providers: [
          { provide: MatDialog, useValue: dialogSpy },
          { provide: PreferencesService, useValue: preferencesSpy },
          { provide: AnalyticsService, useValue: analyticsSpy },
          {
            provide: NativeChromeService,
            useValue: { enabled: true, showOnboarding },
          },
        ],
      })
      service = TestBed.inject(OnboardingService)
    })

    it("shows the native sheet, without the install step", () => {
      expect(service.open("menu")).toBeNull()

      expect(dialogSpy.open).not.toHaveBeenCalled()
      const steps = lastCall(vi.mocked(showOnboarding))[0]
      expect(steps.map((step: { id: string }) => step.id)).toEqual([
        "welcome",
        "books",
        "tools",
        "customize",
      ])
      expect(analyticsSpy.track).toHaveBeenCalledWith("onboarding_open", {
        source: "menu",
      })
    })

    it("words it for the Android app's bars there", () => {
      vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android")
      service.open("menu")

      const steps: NativeOnboardingStep[] = lastCall(
        vi.mocked(showOnboarding),
      )[0]
      const customize = steps.find((step) => step.id === "customize")
      expect(customize?.intro).toContain("«Texto e aparência» (TT)")
      expect(customize?.intro).not.toContain("AA")
    })

    it("words it for the iOS app's bars elsewhere", () => {
      service.open("menu")

      const steps: NativeOnboardingStep[] = lastCall(
        vi.mocked(showOnboarding),
      )[0]
      expect(steps.find((step) => step.id === "customize")?.intro).toContain(
        "AA",
      )
    })

    it("remembers it as seen and reports how it ended", async () => {
      service.open("first_launch")
      finish({ completed: false, lastStep: "books" })
      await Promise.resolve()

      expect(preferencesSpy.setOnboardingSeen).toHaveBeenCalledWith(true)
      expect(analyticsSpy.track).toHaveBeenCalledWith("onboarding_close", {
        source: "first_launch",
        completed: false,
        lastStep: "books",
      })
    })

    // UIKit refuses a sheet while another is on its way (say the passage
    // picker as the first-launch timer fires): it was never seen.
    it("keeps it unseen when the sheet never came up", async () => {
      showOnboarding.mockResolvedValue(null)
      service.open("first_launch")
      await Promise.resolve()
      await Promise.resolve()

      expect(preferencesSpy.setOnboardingSeen).not.toHaveBeenCalled()
      expect(analyticsSpy.track).not.toHaveBeenCalledWith(
        "onboarding_close",
        expect.anything(),
      )

      // Nor does it stay "open": Ajuda in the menu still shows it.
      service.open("menu")
      expect(showOnboarding).toHaveBeenCalledTimes(2)
    })

    // The Android app's native bars replaced the web header (☰) that the
    // onboarding taught: those who saw it before see it once more.
    describe("after the Android app's update to native bars", () => {
      beforeEach(() => {
        vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android")
        preferencesSpy.getOnboardingSeen.mockReturnValue(true)
      })

      it("shows it once more to those who saw it before", async () => {
        vi.useFakeTimers()
        expect(service.showOnFirstLaunch("")).toBe(true)
        await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)
        expect(showOnboarding).toHaveBeenCalledTimes(1)
      })

      it("doesn't once it was seen with the native bars", async () => {
        vi.useFakeTimers()
        preferencesSpy.getNativeBarsOnboardingSeen.mockReturnValue(true)
        expect(service.showOnFirstLaunch("")).toBe(false)
        await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)
        expect(showOnboarding).not.toHaveBeenCalled()
      })

      it("remembers it as seen with the native bars", async () => {
        service.open("first_launch")
        finish({ completed: true, lastStep: "tools" })
        await Promise.resolve()
        expect(preferencesSpy.setNativeBarsOnboardingSeen).toHaveBeenCalledWith(
          true,
        )
      })
    })

    // The iOS app had its native bars from the start: nothing to show again.
    it("doesn't show it again in the iOS app", async () => {
      vi.useFakeTimers()
      vi.spyOn(Capacitor, "getPlatform").mockReturnValue("ios")
      preferencesSpy.getOnboardingSeen.mockReturnValue(true)
      expect(service.showOnFirstLaunch("")).toBe(false)
      await vi.advanceTimersByTimeAsync(FIRST_LAUNCH_DELAY_MS)
      expect(showOnboarding).not.toHaveBeenCalled()
      service.open("menu")
      expect(preferencesSpy.setNativeBarsOnboardingSeen).not.toHaveBeenCalled()
    })

    it("shows one sheet at a time", async () => {
      service.open("menu")
      service.open("menu")
      expect(showOnboarding).toHaveBeenCalledTimes(1)

      finish({ completed: true, lastStep: "tools" })
      await Promise.resolve()
      service.open("menu")
      expect(showOnboarding).toHaveBeenCalledTimes(2)
    })
  })
})
