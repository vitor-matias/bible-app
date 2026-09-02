import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import {
  type BeforeInstallPromptEvent,
  PwaInstallService,
} from "./pwa-install.service"

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 EdgA/125.0.0.0",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
}

function createInstallPromptEvent(
  outcome: "accepted" | "dismissed",
): BeforeInstallPromptEvent & { prompt: jasmine.Spy } {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: jasmine.createSpy("prompt").and.resolveTo(),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  })
}

describe("PwaInstallService", () => {
  let service: PwaInstallService

  describe("platform detection", () => {
    beforeEach(() => {
      service = TestBed.inject(PwaInstallService)
    })

    it("detects Android phones", () => {
      expect(service.detectPlatform(UA.androidChrome, 5)).toBe("android")
      expect(service.detectPlatform(UA.androidFirefox, 5)).toBe("android")
    })

    it("detects iPhones", () => {
      expect(service.detectPlatform(UA.iphoneSafari, 5)).toBe("ios")
      expect(service.detectPlatform(UA.iphoneChrome, 5)).toBe("ios")
    })

    it("detects an iPad hiding behind a desktop Safari user agent", () => {
      expect(service.detectPlatform(UA.macSafari, 5)).toBe("ios")
    })

    it("falls back to desktop for Macs and Windows", () => {
      expect(service.detectPlatform(UA.macSafari, 0)).toBe("desktop")
      expect(service.detectPlatform(UA.macChrome, 0)).toBe("desktop")
      expect(service.detectPlatform(UA.windowsEdge, 0)).toBe("desktop")
    })

    it("identifies the browser family", () => {
      expect(service.detectBrowser(UA.androidChrome)).toBe("chrome")
      expect(service.detectBrowser(UA.iphoneChrome)).toBe("chrome")
      expect(service.detectBrowser(UA.macChrome)).toBe("chrome")
      expect(service.detectBrowser(UA.androidEdge)).toBe("edge")
      expect(service.detectBrowser(UA.windowsEdge)).toBe("edge")
      expect(service.detectBrowser(UA.androidFirefox)).toBe("firefox")
      expect(service.detectBrowser(UA.windowsFirefox)).toBe("firefox")
      expect(service.detectBrowser(UA.iphoneSafari)).toBe("safari")
      expect(service.detectBrowser(UA.macSafari)).toBe("safari")
      expect(service.detectBrowser(UA.androidSamsung)).toBe("other")
    })
  })

  describe("installed state", () => {
    it("is not installed in a regular browser tab", () => {
      service = TestBed.inject(PwaInstallService)

      expect(service.isInstalled).toBeFalse()
    })

    it("is installed when running in standalone display mode", () => {
      spyOn(window, "matchMedia").and.callFake(
        (query: string) =>
          ({
            matches: query === "(display-mode: standalone)",
          }) as MediaQueryList,
      )

      service = TestBed.inject(PwaInstallService)

      expect(service.isInstalled).toBeTrue()
    })

    it("is installed inside the native Capacitor shell", () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)

      service = TestBed.inject(PwaInstallService)

      expect(service.isInstalled).toBeTrue()
    })

    it("becomes installed when the browser fires appinstalled", () => {
      service = TestBed.inject(PwaInstallService)
      const seen: boolean[] = []
      service.installed$.subscribe((value) => seen.push(value))

      window.dispatchEvent(new Event("appinstalled"))

      expect(service.isInstalled).toBeTrue()
      expect(seen).toEqual([false, true])
    })
  })

  describe("native install prompt", () => {
    beforeEach(() => {
      service = TestBed.inject(PwaInstallService)
    })

    it("is unavailable until the browser offers it", async () => {
      expect(service.canPromptInstall).toBeFalse()
      await expectAsync(service.promptInstall()).toBeResolvedTo("unavailable")
    })

    it("captures beforeinstallprompt, suppresses the mini-infobar and shows it on demand", async () => {
      const event = createInstallPromptEvent("accepted")

      window.dispatchEvent(event)

      expect(event.defaultPrevented).toBeTrue()
      expect(service.canPromptInstall).toBeTrue()

      const outcome = await service.promptInstall()

      expect(event.prompt).toHaveBeenCalled()
      expect(outcome).toBe("accepted")
      expect(service.isInstalled).toBeTrue()
      // The event is single-use.
      expect(service.canPromptInstall).toBeFalse()
    })

    it("does not mark the app installed when the user dismisses the prompt", async () => {
      window.dispatchEvent(createInstallPromptEvent("dismissed"))

      const outcome = await service.promptInstall()

      expect(outcome).toBe("dismissed")
      expect(service.isInstalled).toBeFalse()
      expect(service.canPromptInstall).toBeFalse()
    })

    it("reports unavailable when the prompt itself fails", async () => {
      const event = createInstallPromptEvent("accepted")
      event.prompt.and.rejectWith(new Error("blocked"))
      spyOn(console, "error")
      window.dispatchEvent(event)

      await expectAsync(service.promptInstall()).toBeResolvedTo("unavailable")
      expect(console.error).toHaveBeenCalled()
    })
  })
})
