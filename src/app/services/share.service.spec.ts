import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import { SHARE_PLUGIN } from "../tokens"
import { AnalyticsService } from "./analytics.service"
import { ShareService } from "./share.service"

describe("ShareService", () => {
  let service: ShareService
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>
  let mockSharePlugin: { share: jasmine.Spy }
  let originalShare: typeof navigator.share

  const mockBook = {
    id: "gen",
    name: "Génesis",
    shortName: "Gén",
    abrv: "gn",
    chapterCount: 50,
  } as Book

  const mockAboutBook = {
    id: "about",
    name: "About",
    shortName: "Abt",
    abrv: "about",
    chapterCount: 1,
  } as Book

  beforeEach(() => {
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsServiceSpy.track.and.returnValue(Promise.resolve())

    mockSharePlugin = {
      share: jasmine.createSpy("share").and.returnValue(Promise.resolve()),
    }

    originalShare = navigator.share

    TestBed.configureTestingModule({
      providers: [
        ShareService,
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: SHARE_PLUGIN, useValue: mockSharePlugin },
      ],
    })
  })

  afterEach(() => {
    if (originalShare === undefined) {
      // @ts-expect-error
      delete navigator.share
    } else {
      Object.defineProperty(navigator, "share", {
        value: originalShare,
        configurable: true,
        writable: true,
      })
    }
  })

  describe("canShare capability", () => {
    it("should be true if Capacitor is native platform", () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)

      // Instantiate service after spying
      service = TestBed.inject(ShareService)
      expect(service.canShare).toBeTrue()
    })

    it("should be true if navigator.share exists and is a function", () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(false)

      if (!navigator.share) {
        Object.defineProperty(navigator, "share", {
          value: () => Promise.resolve(),
          configurable: true,
          writable: true,
        })
      }

      service = TestBed.inject(ShareService)
      expect(service.canShare).toBeTrue()
    })

    it("should be false if not native and navigator.share is missing", () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(false)

      Object.defineProperty(navigator, "share", {
        value: undefined,
        configurable: true,
        writable: true,
      })

      service = TestBed.inject(ShareService)
      expect(service.canShare).toBeFalse()
    })
  })

  describe("share()", () => {
    beforeEach(() => {
      // Default to native platform for sharing tests unless specified
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
      service = TestBed.inject(ShareService)
    })

    it("should not execute if canShare is false", async () => {
      ;(Capacitor.isNativePlatform as jasmine.Spy).and.returnValue(false)
      Object.defineProperty(navigator, "share", {
        value: undefined,
        configurable: true,
        writable: true,
      })

      await service.share(mockBook, 1)

      expect(mockSharePlugin.share).not.toHaveBeenCalled()
      expect(analyticsServiceSpy.track).not.toHaveBeenCalled()
    })

    it("should use Capacitor Share plugin when native", async () => {
      await service.share(mockBook, 1)

      expect(mockSharePlugin.share).toHaveBeenCalledWith({
        title: "Biblia Sagrada",
        text: "Ler Génesis 1.",
        url: window.location.href,
        dialogTitle: "Partilhar passagem",
      })
      expect(analyticsServiceSpy.track).toHaveBeenCalledWith("share", {
        book: "gen",
        chapter: 1,
      })
    })

    it("should format text differently for the 'about' book", async () => {
      await service.share(mockAboutBook, 1)

      expect(mockSharePlugin.share).toHaveBeenCalledWith({
        title: "Biblia Sagrada",
        text: "Leia a Biblia nesta app.",
        url: window.location.href,
        dialogTitle: "Partilhar passagem",
      })
    })

    it("should use navigator.share on web platforms", async () => {
      // Because canShare is a dynamic getter we can drive web behaviour
      // by resetting the Capacitor spy and patching navigator.share directly,
      // then re-injecting the service so the getter sees the updated platform.
      ;(Capacitor.isNativePlatform as jasmine.Spy).and.returnValue(false)

      const navShareSpy = jasmine
        .createSpy("share")
        .and.returnValue(Promise.resolve())
      Object.defineProperty(navigator, "share", {
        value: navShareSpy,
        configurable: true,
        writable: true,
      })

      // service is already injected from beforeEach; since canShare is a getter
      // that calls Capacitor.isNativePlatform() each time, the spy above is
      // enough — no need to recreate the service.
      await service.share(mockBook, 5)

      expect(navShareSpy).toHaveBeenCalledWith({
        title: "Biblia Sagrada",
        text: "Ler Génesis 5.",
        url: window.location.href,
      })
      expect(mockSharePlugin.share).not.toHaveBeenCalled()
      expect(analyticsServiceSpy.track).toHaveBeenCalledWith("share", {
        book: "gen",
        chapter: 5,
      })
    })

    it("should ignore user-cancelled share attempts", async () => {
      const cancelError = new Error("User cancelled")
      cancelError.name = "AbortError"
      mockSharePlugin.share.and.returnValue(Promise.reject(cancelError))

      await expectAsync(service.share(mockBook, 1)).toBeResolved()

      expect(analyticsServiceSpy.track).not.toHaveBeenCalled()
    })

    it("should track unexpected share failures", async () => {
      mockSharePlugin.share.and.returnValue(Promise.reject(new Error("boom")))

      await expectAsync(service.share(mockBook, 1)).toBeResolved()

      expect(analyticsServiceSpy.track).toHaveBeenCalledWith("share_error", {
        book: "gen",
        chapter: 1,
        error: "boom",
      })
    })
  })
})
