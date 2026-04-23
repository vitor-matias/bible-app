import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
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
      // Force it to false via spy (even though it's readonly, we bypass for test)
      Object.defineProperty(service, "canShare", { value: false })

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
      // Reset the Capacitor spy to false to trigger web fallback
      ;(Capacitor.isNativePlatform as jasmine.Spy).and.returnValue(false)

      const navShareSpy = jasmine
        .createSpy("share")
        .and.returnValue(Promise.resolve())
      Object.defineProperty(navigator, "share", {
        value: navShareSpy,
        configurable: true,
        writable: true,
      })

      // We have to recreate the service so the constructor picks up the web platform correctly
      service = new ShareService(
        mockSharePlugin as unknown as typeof Share,
        analyticsServiceSpy,
      )

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

    it("should swallow errors when sharing fails or is cancelled", async () => {
      mockSharePlugin.share.and.returnValue(Promise.reject("User cancelled"))
      const consoleErrorSpy = spyOn(console, "error")

      await expectAsync(service.share(mockBook, 1)).toBeResolved()

      // Tracking should not happen if share threw an error
      expect(analyticsServiceSpy.track).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled() // Ensures it failed silently
    })
  })
})
