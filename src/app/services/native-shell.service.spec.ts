import { DOCUMENT } from "@angular/common"
import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor, SystemBarsStyle, SystemBarType } from "@capacitor/core"
import { Subject } from "rxjs"
import { SPLASH_SCREEN_PLUGIN, SYSTEM_BARS_PLUGIN } from "../tokens"
import { NativeChromeService } from "./native-chrome.service"
import { NativeShellService, SPLASH_MAX_MS } from "./native-shell.service"

describe("NativeShellService", () => {
  let events: Subject<unknown>
  let splash: { hide: jasmine.Spy }
  let systemBars: { setStyle: jasmine.Spy }
  let body: HTMLElement

  beforeEach(() => {
    events = new Subject()
    splash = { hide: jasmine.createSpy("hide").and.resolveTo() }
    systemBars = { setStyle: jasmine.createSpy("setStyle").and.resolveTo() }
    body = document.createElement("body")
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: SPLASH_SCREEN_PLUGIN, useValue: splash },
        { provide: SYSTEM_BARS_PLUGIN, useValue: systemBars },
        { provide: DOCUMENT, useValue: { body } },
      ],
    })
    // requestAnimationFrame is not driven by fakeAsync; run it inline.
    spyOn(window, "requestAnimationFrame").and.callFake((callback) => {
      callback(0)
      return 0
    })
  })

  function init(platform: "android" | "ios" | "web"): void {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(platform !== "web")
    spyOn(Capacitor, "getPlatform").and.returnValue(platform)
    TestBed.inject(NativeShellService).init()
  }

  it("tags the body with the native platform", fakeAsync(() => {
    init("ios")
    expect(body.classList).toContain("native-app")
    expect(body.classList).toContain("platform-ios")
    tick(SPLASH_MAX_MS)
  }))

  it("hides the splash once, after the first navigation", fakeAsync(() => {
    init("android")
    expect(splash.hide).not.toHaveBeenCalled()

    events.next(new NavigationEnd(1, "/", "/"))
    events.next(new NavigationEnd(2, "/gn/1", "/gn/1"))
    tick(SPLASH_MAX_MS)

    expect(splash.hide).toHaveBeenCalledTimes(1)
  }))

  it("hides the splash anyway if no navigation completes", fakeAsync(() => {
    init("android")
    tick(SPLASH_MAX_MS - 1)
    expect(splash.hide).not.toHaveBeenCalled()
    tick(1)
    expect(splash.hide).toHaveBeenCalledTimes(1)
  }))

  it("retries from the timeout if the first hide fails", fakeAsync(() => {
    splash.hide.and.returnValues(
      Promise.reject(new Error("not ready")),
      Promise.resolve(),
    )
    init("android")

    events.next(new NavigationEnd(1, "/", "/"))
    tick(SPLASH_MAX_MS)

    expect(splash.hide).toHaveBeenCalledTimes(2)
  }))

  it("does nothing on the web", fakeAsync(() => {
    init("web")
    events.next(new NavigationEnd(1, "/", "/"))
    tick(SPLASH_MAX_MS)
    expect(body.classList.length).toBe(0)
    expect(splash.hide).not.toHaveBeenCalled()
  }))

  // The toolbar is always brown: left to SystemBars' default, a light-mode
  // phone drew dark icons on it.
  it("styles the status bar icons light", fakeAsync(() => {
    init("android")
    expect(systemBars.setStyle).toHaveBeenCalledOnceWith({
      bar: SystemBarType.StatusBar,
      style: SystemBarsStyle.Dark,
    })
    tick(SPLASH_MAX_MS)
  }))

  it("leaves the system bars alone on the web", fakeAsync(() => {
    init("web")
    TestBed.inject(NativeShellService).setNavigationBarTheme(true)
    expect(systemBars.setStyle).not.toHaveBeenCalled()
    tick(SPLASH_MAX_MS)
  }))

  describe("on Android", () => {
    let shell: NativeShellService

    beforeEach(() => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
      spyOn(Capacitor, "getPlatform").and.returnValue("android")
      // The real document, so the shell can measure the safe area.
      TestBed.overrideProvider(DOCUMENT, { useValue: document })
      shell = TestBed.inject(NativeShellService)
    })

    afterEach(() => {
      document.documentElement.style.removeProperty("--app-inset-top")
    })

    // The navigation bar draws over the page, so it follows the in-app
    // theme, not the device theme.
    it("styles the navigation bar for the in-app theme", () => {
      document.documentElement.style.setProperty("--app-inset-top", "24px")

      shell.setNavigationBarTheme(true)
      expect(systemBars.setStyle).toHaveBeenCalledWith({
        bar: SystemBarType.NavigationBar,
        style: SystemBarsStyle.Dark,
      })

      shell.setNavigationBarTheme(false)
      expect(systemBars.setStyle).toHaveBeenCalledWith({
        bar: SystemBarType.NavigationBar,
        style: SystemBarsStyle.Light,
      })
    })

    // Older WebViews (Android 8, 9) report no safe area: the page stops at
    // the bars, which show MainActivity's brown window background instead.
    it("keeps the navigation bar icons light where the page stops at the bars", () => {
      const children = document.body.childElementCount

      shell.setNavigationBarTheme(false)

      expect(systemBars.setStyle).toHaveBeenCalledOnceWith({
        bar: SystemBarType.NavigationBar,
        style: SystemBarsStyle.Dark,
      })
      expect(document.body.childElementCount).toBe(children)
    })
  })

  it("does not surface a failed system bar call", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    systemBars.setStyle.and.rejectWith(new Error("unavailable"))
    expect(() =>
      TestBed.inject(NativeShellService).setNavigationBarTheme(true),
    ).not.toThrow()
    await Promise.resolve()
  })

  // The app's bars, drawn by the page: light in the light theme.
  describe("with the web's own bars", () => {
    let chrome: { bars: boolean; init: jasmine.Spy }

    beforeEach(() => {
      chrome = { bars: true, init: jasmine.createSpy("init") }
      TestBed.overrideProvider(NativeChromeService, { useValue: chrome })
    })

    describe("on Android", () => {
      beforeEach(() => {
        // The real document, so the shell can measure the safe area.
        TestBed.overrideProvider(DOCUMENT, { useValue: document })
      })

      afterEach(() => {
        document.documentElement.style.removeProperty("--app-inset-top")
        document.body.classList.remove("native-app", "platform-android")
      })

      it("lets the status bar follow the theme", fakeAsync(() => {
        document.documentElement.style.setProperty("--app-inset-top", "24px")
        init("android")
        expect(systemBars.setStyle).not.toHaveBeenCalledWith({
          bar: SystemBarType.StatusBar,
          style: SystemBarsStyle.Dark,
        })

        TestBed.inject(NativeShellService).setNavigationBarTheme(false)
        expect(systemBars.setStyle).toHaveBeenCalledWith({
          bar: SystemBarType.StatusBar,
          style: SystemBarsStyle.Light,
        })
        tick(SPLASH_MAX_MS)
      }))

      // Older WebViews (Android 8, 9): the status bar shows MainActivity's
      // brown window background, as the navigation bar does.
      it("keeps the status bar icons light where the page stops at the bars", fakeAsync(() => {
        init("android")

        TestBed.inject(NativeShellService).setNavigationBarTheme(false)
        expect(systemBars.setStyle).not.toHaveBeenCalledWith({
          bar: SystemBarType.StatusBar,
          style: SystemBarsStyle.Light,
        })
        expect(systemBars.setStyle).toHaveBeenCalledWith({
          bar: SystemBarType.StatusBar,
          style: SystemBarsStyle.Dark,
        })
        tick(SPLASH_MAX_MS)
      }))
    })

    it("starts them in phone browsers", fakeAsync(() => {
      init("web")
      expect(chrome.init).toHaveBeenCalledTimes(1)
      expect(splash.hide).not.toHaveBeenCalled()
      tick(SPLASH_MAX_MS)
    }))
  })
})
