import { DOCUMENT } from "@angular/common"
import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor, SystemBarsStyle, SystemBarType } from "@capacitor/core"
import { Subject } from "rxjs"
import { SPLASH_SCREEN_PLUGIN, SYSTEM_BARS_PLUGIN } from "../tokens"
import { LiveUpdateService } from "./live-update.service"
import { NativeShellService, SPLASH_MAX_MS } from "./native-shell.service"

describe("NativeShellService", () => {
  let events: Subject<unknown>
  let splash: { hide: jasmine.Spy }
  let systemBars: { setStyle: jasmine.Spy }
  let liveUpdate: { readyAndCheck: jasmine.Spy }
  let body: HTMLElement

  beforeEach(() => {
    events = new Subject()
    splash = { hide: jasmine.createSpy("hide").and.resolveTo() }
    systemBars = { setStyle: jasmine.createSpy("setStyle").and.resolveTo() }
    liveUpdate = {
      readyAndCheck: jasmine.createSpy("readyAndCheck").and.resolveTo(),
    }
    body = document.createElement("body")
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: SPLASH_SCREEN_PLUGIN, useValue: splash },
        { provide: SYSTEM_BARS_PLUGIN, useValue: systemBars },
        { provide: LiveUpdateService, useValue: liveUpdate },
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

  // The navigation bar draws over the page, so it follows the in-app theme,
  // not the device theme.
  it("styles the navigation bar for the in-app theme", () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    const shell = TestBed.inject(NativeShellService)

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

  it("does not surface a failed system bar call", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    systemBars.setStyle.and.rejectWith(new Error("unavailable"))
    expect(() =>
      TestBed.inject(NativeShellService).setNavigationBarTheme(true),
    ).not.toThrow()
    await Promise.resolve()
  })

  // ready() is what stops the live-update plugin rolling back: only a page
  // that actually rendered may call it.
  it("confirms the bundle and checks for updates after the first navigation", fakeAsync(() => {
    init("android")
    expect(liveUpdate.readyAndCheck).not.toHaveBeenCalled()

    events.next(new NavigationEnd(1, "/", "/"))
    events.next(new NavigationEnd(2, "/gn/1", "/gn/1"))
    tick(SPLASH_MAX_MS)

    expect(liveUpdate.readyAndCheck).toHaveBeenCalledTimes(1)
  }))

  it("lets a bundle that never navigates roll back", fakeAsync(() => {
    init("android")
    tick(SPLASH_MAX_MS)
    expect(liveUpdate.readyAndCheck).not.toHaveBeenCalled()
  }))

  it("does not check for live updates on the web", fakeAsync(() => {
    init("web")
    events.next(new NavigationEnd(1, "/", "/"))
    tick(SPLASH_MAX_MS)
    expect(liveUpdate.readyAndCheck).not.toHaveBeenCalled()
  }))
})
