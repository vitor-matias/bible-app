import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { MatDialog, type MatDialogRef } from "@angular/material/dialog"
import { Subject } from "rxjs"
import {
  OnboardingComponent,
  type OnboardingResult,
} from "../components/onboarding/onboarding.component"
import { AnalyticsService } from "./analytics.service"
import { FIRST_LAUNCH_DELAY_MS, OnboardingService } from "./onboarding.service"
import { PreferencesService } from "./preferences.service"

describe("OnboardingService", () => {
  let service: OnboardingService
  let dialogSpy: jasmine.SpyObj<MatDialog>
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<OnboardingComponent>>
  let preferencesSpy: jasmine.SpyObj<PreferencesService>
  let analyticsSpy: jasmine.SpyObj<AnalyticsService>
  let afterClosed$: Subject<OnboardingResult | undefined>

  beforeEach(() => {
    afterClosed$ = new Subject()
    dialogRefSpy = jasmine.createSpyObj("MatDialogRef", ["afterClosed"])
    dialogRefSpy.afterClosed.and.returnValue(afterClosed$.asObservable())
    dialogSpy = jasmine.createSpyObj("MatDialog", ["open"])
    dialogSpy.open.and.returnValue(dialogRefSpy)
    preferencesSpy = jasmine.createSpyObj("PreferencesService", [
      "getOnboardingSeen",
      "setOnboardingSeen",
    ])
    preferencesSpy.getOnboardingSeen.and.returnValue(false)
    analyticsSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.and.resolveTo()

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
    it("opens the wizard on a first visit once the reader has had time to paint", fakeAsync(() => {
      expect(service.showOnFirstLaunch("")).toBeTrue()
      expect(dialogSpy.open).not.toHaveBeenCalled()

      tick(FIRST_LAUNCH_DELAY_MS)

      expect(dialogSpy.open).toHaveBeenCalledWith(
        OnboardingComponent,
        jasmine.objectContaining({ data: { source: "first_launch" } }),
      )
      expect(analyticsSpy.track).toHaveBeenCalledWith("onboarding_open", {
        source: "first_launch",
      })
    }))

    it("stays quiet once the wizard has been seen", fakeAsync(() => {
      preferencesSpy.getOnboardingSeen.and.returnValue(true)

      expect(service.showOnFirstLaunch("")).toBeFalse()
      tick(FIRST_LAUNCH_DELAY_MS)

      expect(dialogSpy.open).not.toHaveBeenCalled()
    }))

    it("does not reopen once the timer fires after the wizard was already seen", fakeAsync(() => {
      expect(service.showOnFirstLaunch("")).toBeTrue()

      // The user opens the wizard from the menu and dismisses it before the
      // first-launch timer fires, which marks it seen — the stale timer must
      // not undo that and reopen it a moment later.
      service.open("menu")
      preferencesSpy.getOnboardingSeen.and.returnValue(true)
      afterClosed$.next(undefined)
      dialogSpy.open.calls.reset()

      tick(FIRST_LAUNCH_DELAY_MS)

      expect(dialogSpy.open).not.toHaveBeenCalled()
    }))

    it("does not get in the way of a share-target launch", fakeAsync(() => {
      expect(service.showOnFirstLaunch("?text=Jo%203,16")).toBeFalse()
      expect(
        service.showOnFirstLaunch(
          "?url=https%3A%2F%2Fbiblia.capuchinhos.org%2Fjo%2F3",
        ),
      ).toBeFalse()
      // A share sheet that only sends a title (no url/text) is still a share,
      // matching AppComponent.handleShareTarget's three-field detection.
      expect(service.showOnFirstLaunch("?title=Salmo%2023")).toBeFalse()
      tick(FIRST_LAUNCH_DELAY_MS)

      expect(dialogSpy.open).not.toHaveBeenCalled()
    }))
  })

  describe("open", () => {
    it("opens the wizard with an accessible, size-constrained dialog", () => {
      const ref = service.open("menu")

      expect(ref).toBe(dialogRefSpy)
      expect(dialogSpy.open).toHaveBeenCalledWith(
        OnboardingComponent,
        jasmine.objectContaining({
          data: { source: "menu" },
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
})
