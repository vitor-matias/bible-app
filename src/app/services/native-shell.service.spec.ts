import { DOCUMENT } from "@angular/common"
import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { Subject } from "rxjs"
import { SPLASH_SCREEN_PLUGIN } from "../tokens"
import { NativeShellService, SPLASH_MAX_MS } from "./native-shell.service"

describe("NativeShellService", () => {
  let events: Subject<unknown>
  let splash: { hide: jasmine.Spy }
  let body: HTMLElement

  beforeEach(() => {
    events = new Subject()
    splash = { hide: jasmine.createSpy("hide").and.resolveTo() }
    body = document.createElement("body")
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: SPLASH_SCREEN_PLUGIN, useValue: splash },
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
})
